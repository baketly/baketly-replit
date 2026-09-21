// Reading products off a page that describes them only to human beings.
//
// Two passes. Microdata first — itemprop="name" beside itemprop="price" is
// still structured data, just inline. Then a heuristic pass: find the prices,
// and for each one look back for the nearest thing that reads like a product
// name. Conservative by design: a price with no plausible name attached is
// dropped rather than guessed at, and confidence stays well below what the
// structured parsers claim.

import { normalizeProduct, normalizedNameKey } from "../normalize";
import type { ExtractedProduct, SourceType } from "../types";
import { currencyFrom, parsePrice } from "./price";

const PRICE_PATTERN =
  /(?:[$€£₪]|\bUSD\b|\bEUR\b|\bGBP\b|\bILS\b)\s?\d{1,4}(?:[.,]\d{1,2})?|\d{1,4}(?:[.,]\d{1,2})?\s?(?:[$€£₪]|\bUSD\b|\bEUR\b|\bGBP\b|\bILS\b)/g;

const NAME_PATTERN =
  /<(?:h[1-6]|a|span|div|p)\b[^>]*(?:class=["'][^"']*(?:title|name|product|item|heading)[^"']*["'])?[^>]*>([^<>]{3,90})<\/(?:h[1-6]|a|span|div|p)>/gi;

/** Page text with the parts that are never product names taken out. */
function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ");
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A name a person would recognise as a product rather than a button. */
function plausibleName(value: string): boolean {
  const text = value.trim();
  if (text.length < 3 || text.length > 90) return false;
  if (!/[a-z]{3}/i.test(text)) return false;
  if (/^(add to (cart|bag|basket)|buy now|shop now|view|more|read more|select options|sold out|home|menu|order|contact|about)$/i.test(text)) {
    return false;
  }
  // a whole sentence is a description, not a product name
  if (text.split(/\s+/).length > 12) return false;
  return true;
}

function build(
  name: string,
  priceText: string,
  sourceUrl: string,
  sourceType: SourceType,
  confidence: number,
  pageCurrency: string | null,
): ExtractedProduct | null {
  const key = normalizedNameKey(name);
  if (!key) return null;
  const parsed = parsePrice(priceText, pageCurrency);
  if (!parsed) return null;
  const reading = normalizeProduct(name, null);
  // A price that says "from" belongs to the cheapest version of something,
  // which is not the same as the price of the thing named.
  const confidenceForPrice = parsed.isFrom ? Math.min(confidence, 0.5) : confidence;
  return {
    name: name.slice(0, 200),
    normalizedName: key,
    category: reading.category === "unknown" ? null : reading.category,
    subcategory: reading.subcategory,
    flavor: reading.flavor,
    description: null,
    quantity: reading.quantity,
    unit: reading.unit,
    weight: reading.weight,
    weightUnit: reading.weightUnit,
    price: parsed.price,
    currency: parsed.currency,
    sourceUrl,
    sourceType,
    confidence: confidenceForPrice,
  };
}

/** itemprop markup: inline, but still the site stating its own prices. */
function extractMicrodata(html: string, sourceUrl: string): ExtractedProduct[] {
  const found: ExtractedProduct[] = [];
  const seen = new Set<string>();
  const scopePattern = /<[^>]*itemtype=["'][^"']*schema\.org\/Product[^"']*["'][\s\S]{0,4000}?(?=<[^>]*itemtype=|$)/gi;
  let scope: RegExpExecArray | null;
  while ((scope = scopePattern.exec(html)) !== null) {
    const block = scope[0];
    const name =
      block.match(/itemprop=["']name["'][^>]*>([^<]{3,90})</i)?.[1] ??
      block.match(/itemprop=["']name["'][^>]*content=["']([^"']{3,90})["']/i)?.[1];
    const price =
      block.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
      block.match(/itemprop=["']price["'][^>]*>([^<]+)</i)?.[1];
    const currency =
      block.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null;
    if (!name || !price) continue;
    const clean = decode(name);
    if (!plausibleName(clean)) continue;
    const key = normalizedNameKey(clean);
    if (seen.has(key)) continue;
    const product = build(clean, price, sourceUrl, "microdata", 0.85, currency);
    if (product) {
      seen.add(key);
      found.push(product);
    }
  }
  return found;
}

/**
 * The last deterministic pass: prices on the page, each attached to the
 * nearest preceding text that reads like a product name.
 */
export function extractHtml(html: string, sourceUrl: string, limit = 60): ExtractedProduct[] {
  const cleaned = stripNoise(html);
  const microdata = extractMicrodata(cleaned, sourceUrl);
  if (microdata.length) return microdata.slice(0, limit);

  const pageCurrency = currencyFrom(cleaned.slice(0, 50_000));

  // every candidate name and where it sits on the page
  const names: Array<{ at: number; text: string }> = [];
  let nameMatch: RegExpExecArray | null;
  NAME_PATTERN.lastIndex = 0;
  while ((nameMatch = NAME_PATTERN.exec(cleaned)) !== null) {
    const text = decode(nameMatch[1]);
    if (plausibleName(text)) names.push({ at: nameMatch.index, text });
  }
  if (names.length === 0) return [];

  const found: ExtractedProduct[] = [];
  const seen = new Set<string>();
  let priceMatch: RegExpExecArray | null;
  PRICE_PATTERN.lastIndex = 0;
  while ((priceMatch = PRICE_PATTERN.exec(cleaned)) !== null && found.length < limit) {
    const at = priceMatch.index;
    // the nearest name before the price, within a card's worth of markup
    let nearest: { at: number; text: string } | null = null;
    for (const candidate of names) {
      if (candidate.at >= at) break;
      if (at - candidate.at > 1_200) continue;
      nearest = candidate;
    }
    if (!nearest) continue;
    const key = normalizedNameKey(nearest.text);
    if (seen.has(key)) continue;
    const product = build(nearest.text, priceMatch[0], sourceUrl, "html", 0.6, pageCurrency);
    if (product) {
      seen.add(key);
      found.push(product);
    }
  }

  return found;
}
