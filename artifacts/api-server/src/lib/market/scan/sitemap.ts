// The shop's own index of its pages.
//
// Square Online, Squarespace and the rest build their catalogues in the
// browser: the homepage carries no prices a parser can see, and following
// links from it finds a menu that is one long script. But the same sites
// publish a sitemap, because search engines need one, and a sitemap names
// every product page directly.
//
// Reading it turns "this site has no prices" into a list of pages that each
// hold exactly one product, which is the easiest thing in the world to parse.

import { normalizeProduct, normalizedNameKey } from "../normalize";
import type { ExtractedProduct } from "../types";
import { fetchPage } from "./fetch";
import { parsePrice } from "./price";

const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"];
const MAX_SITEMAPS = 4;
const PRODUCT_PATH = /\/(product|products|item|items|shop|store|menu)\//i;

/** URLs listed in a sitemap, following one level of sitemap index. */
async function collectUrls(siteUrl: string): Promise<string[]> {
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return [];
  }

  const found: string[] = [];
  const queue: string[] = SITEMAP_PATHS.map((path) => new URL(path, base).toString());
  const seen = new Set<string>();
  let fetched = 0;

  while (queue.length && fetched < MAX_SITEMAPS) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    const page = await fetchPage(next, 6_000);
    if (!page.ok || !page.body.includes("<loc>")) continue;
    fetched += 1;

    const locations = [...page.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) =>
      match[1].replace(/&amp;/g, "&"),
    );
    // a sitemap index points at more sitemaps; take the ones likely to hold
    // products rather than blog posts
    const nested = locations.filter((location) => /\.xml(\.gz)?$/i.test(location));
    if (nested.length && found.length === 0) {
      for (const location of nested.slice(0, MAX_SITEMAPS)) {
        if (/product|item|shop|store/i.test(location)) queue.unshift(location);
        else queue.push(location);
      }
    }
    for (const location of locations) {
      if (!/\.xml(\.gz)?$/i.test(location)) found.push(location);
    }
    if (found.length > 2_000) break;
  }

  return found;
}

/** Product pages a sitemap names, nearest thing to a catalogue these sites have. */
export async function sitemapProductUrls(siteUrl: string, limit = 25): Promise<string[]> {
  const urls = await collectUrls(siteUrl);
  const products = urls.filter((url) => PRODUCT_PATH.test(url));
  // Spread the sample across the catalogue rather than taking the first 25
  // alphabetically, which on most shops is everything beginning with A.
  if (products.length <= limit) return products;
  const step = products.length / limit;
  const spread: string[] = [];
  for (let index = 0; index < limit; index++) {
    spread.push(products[Math.floor(index * step)]);
  }
  return spread;
}

/** The page's own title, which on a product page is the product. */
function titleOf(html: string): string | null {
  const heading = html.match(/<h1\b[^>]*>([\s\S]{3,120}?)<\/h1>/i)?.[1];
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,120})["']/i)?.[1];
  const title = html.match(/<title\b[^>]*>([^<]{3,160})<\/title>/i)?.[1];
  const raw = heading || og || title;
  if (!raw) return null;
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    // "Almond Croissant | Le French Dad" — the shop's name is not the product's
    .split(/\s+[|–—]\s+/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** The price a product page states for the one thing it sells. */
function priceOf(html: string): { text: string; currency: string | null } | null {
  const meta =
    html.match(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const currency =
    html.match(/<meta[^>]+property=["'](?:product|og):price:currency["'][^>]+content=["']([A-Z]{3})["']/i)?.[1] ||
    html.match(/"currency(?:Code)?"\s*:\s*"([A-Z]{3})"/)?.[1] ||
    null;
  if (meta) return { text: meta, currency };

  // Square Online and friends leave the price in their page data, quoted in
  // the smallest unit next to its currency.
  const embedded = html.match(/"(?:price|amount)"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/);
  if (embedded) return { text: embedded[1], currency };

  // last resort: the first price-looking thing in the body
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .match(/[$€£₪]\s?\d{1,4}(?:[.,]\d{1,2})?/);
  return visible ? { text: visible[0], currency } : null;
}

/**
 * One product, from a page that sells one product. Returns null when the page
 * does not name a product or state a price.
 */
export function extractProductPage(html: string, sourceUrl: string): ExtractedProduct | null {
  const name = titleOf(html);
  if (!name) return null;
  const key = normalizedNameKey(name);
  if (!key) return null;
  const found = priceOf(html);
  if (!found) return null;
  const parsed = parsePrice(found.text, found.currency);
  if (!parsed) return null;

  const description =
    html
      .match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,400})["']/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() || null;
  const reading = normalizeProduct(name, description);

  return {
    name,
    normalizedName: key,
    category: reading.category === "unknown" ? null : reading.category,
    subcategory: reading.subcategory,
    flavor: reading.flavor,
    description,
    quantity: reading.quantity,
    unit: reading.unit,
    weight: reading.weight,
    weightUnit: reading.weightUnit,
    price: parsed.price,
    currency: parsed.currency,
    sourceUrl,
    sourceType: "html",
    // one page, one product, its own title and its own price
    confidence: parsed.isFrom ? 0.5 : 0.8,
  };
}
