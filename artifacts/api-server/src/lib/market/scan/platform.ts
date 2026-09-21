// Which shop platform a site runs on, and what that platform will tell us.
//
// Shopify, WooCommerce, Wix and Square all publish their catalogues in a
// predictable place. Knowing which one a bakery uses turns "parse this page"
// into "ask this endpoint", which is both more reliable and kinder to the
// site: one JSON request instead of a dozen pages.

import { normalizeProduct, normalizedNameKey } from "../normalize";
import type { ExtractedProduct, SourceType } from "../types";
import { fetchPage } from "./fetch";
import { parsePrice } from "./price";

export type Platform = "shopify" | "woocommerce" | "wix" | "square" | "toast" | "unknown";

/**
 * The currency a shop prices in, as its own pages declare it. Shopify and
 * most platforms stamp it into the page; schema.org markup carries it too.
 */
export function detectCurrency(html: string): string | null {
  const patterns = [
    /Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/,
    /"currencyCode"\s*:\s*"([A-Z]{3})"/,
    /"priceCurrency"\s*:\s*"([A-Z]{3})"/,
    /itemprop=["']priceCurrency["'][^>]*content=["']([A-Z]{3})["']/,
    /<meta[^>]+property=["']og:price:currency["'][^>]+content=["']([A-Z]{3})["']/,
  ];
  for (const pattern of patterns) {
    const found = html.match(pattern);
    if (found) return found[1];
  }
  return null;
}

/** Read from the homepage's markup, which every platform stamps. */
export function detectPlatform(html: string, finalUrl: string): Platform {
  const haystack = html.slice(0, 200_000).toLowerCase();
  if (haystack.includes("cdn.shopify.com") || haystack.includes("shopify-features")) {
    return "shopify";
  }
  if (haystack.includes("woocommerce") || haystack.includes("wp-content/plugins/woocommerce")) {
    return "woocommerce";
  }
  if (haystack.includes("wix.com") || haystack.includes("wixstatic.com")) return "wix";
  if (haystack.includes("squareup.com") || haystack.includes("square-web-payments")) {
    return "square";
  }
  if (haystack.includes("toasttab.com") || finalUrl.includes("toasttab.com")) return "toast";
  return "unknown";
}

interface ShopifyVariant {
  title?: string;
  price?: string | number;
  grams?: number;
  available?: boolean;
}

interface ShopifyProduct {
  title?: string;
  handle?: string;
  body_html?: string;
  product_type?: string;
  variants?: ShopifyVariant[];
}

/**
 * Shopify publishes its catalogue at /products.json. Each variant is a real
 * listing with its own price, which is exactly what a market needs: "6 for
 * $18" and "12 for $30" are two variants of one product.
 */
export async function fetchShopifyProducts(
  siteUrl: string,
  limit = 250,
  /** the shop's currency, which its catalogue JSON leaves out */
  currency: string | null = null,
): Promise<ExtractedProduct[]> {
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return [];
  }
  const endpoint = new URL("/products.json?limit=" + Math.min(250, limit), base).toString();
  const page = await fetchPage(endpoint);
  if (!page.ok) return [];

  let payload: { products?: ShopifyProduct[] };
  try {
    payload = JSON.parse(page.body) as { products?: ShopifyProduct[] };
  } catch {
    return [];
  }
  if (!Array.isArray(payload.products)) return [];

  const found: ExtractedProduct[] = [];
  const seen = new Set<string>();

  for (const product of payload.products) {
    const title = (product.title || "").trim();
    if (!title) continue;
    const productUrl = product.handle
      ? new URL("/products/" + product.handle, base).toString()
      : endpoint;
    const description = (product.body_html || "").replace(/<[^>]*>/g, " ").trim();

    for (const variant of product.variants || []) {
      if (variant.available === false) continue;
      // "Default Title" means the product has no real variants
      const variantTitle =
        variant.title && !/^default title$/i.test(variant.title) ? variant.title : "";
      const name = variantTitle ? title + " — " + variantTitle : title;
      const key = normalizedNameKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const parsed = parsePrice(String(variant.price ?? ""), currency);
      const reading = normalizeProduct(name, description, product.product_type || null);
      found.push({
        name: name.slice(0, 200),
        normalizedName: key,
        category: reading.category === "unknown" ? null : reading.category,
        subcategory: reading.subcategory,
        flavor: reading.flavor,
        description: description ? description.slice(0, 400) : null,
        quantity: reading.quantity,
        unit: reading.unit,
        weight: reading.weight ?? (variant.grams ? variant.grams : null),
        weightUnit: reading.weightUnit ?? (variant.grams ? "g" : null),
        price: parsed ? parsed.price : null,
        currency: parsed?.currency ?? currency,
        sourceUrl: productUrl,
        sourceType: "shopify" as SourceType,
        confidence: parsed ? 0.92 : 0.5,
      });
      if (found.length >= limit) return found;
    }
  }

  return found;
}

/**
 * WooCommerce's REST catalogue, where the shop leaves it open. Many do not,
 * and an empty answer simply hands the page to the next parser.
 */
export async function fetchWooProducts(
  siteUrl: string,
  limit = 100,
): Promise<ExtractedProduct[]> {
  let base: URL;
  try {
    base = new URL(siteUrl);
  } catch {
    return [];
  }
  const endpoint = new URL(
    "/wp-json/wc/store/products?per_page=" + Math.min(100, limit),
    base,
  ).toString();
  const page = await fetchPage(endpoint);
  if (!page.ok) return [];

  interface WooProduct {
    name?: string;
    permalink?: string;
    short_description?: string;
    prices?: { price?: string; currency_code?: string; currency_minor_unit?: number };
  }
  let payload: WooProduct[];
  try {
    payload = JSON.parse(page.body) as WooProduct[];
  } catch {
    return [];
  }
  if (!Array.isArray(payload)) return [];

  const found: ExtractedProduct[] = [];
  const seen = new Set<string>();
  for (const product of payload) {
    const name = (product.name || "").trim();
    if (!name) continue;
    const key = normalizedNameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // Woo's store API gives minor units: 1800 with minor_unit 2 is 18.00
    const minorUnit = product.prices?.currency_minor_unit ?? 2;
    const raw = Number(product.prices?.price);
    const price = Number.isFinite(raw) ? raw / 10 ** minorUnit : null;
    const description = (product.short_description || "").replace(/<[^>]*>/g, " ").trim();
    const reading = normalizeProduct(name, description);

    found.push({
      name: name.slice(0, 200),
      normalizedName: key,
      category: reading.category === "unknown" ? null : reading.category,
      subcategory: reading.subcategory,
      flavor: reading.flavor,
      description: description ? description.slice(0, 400) : null,
      quantity: reading.quantity,
      unit: reading.unit,
      weight: reading.weight,
      weightUnit: reading.weightUnit,
      price: price !== null && price > 0 ? Math.round(price * 100) / 100 : null,
      currency: product.prices?.currency_code || null,
      sourceUrl: product.permalink || endpoint,
      sourceType: "woocommerce" as SourceType,
      confidence: price ? 0.92 : 0.5,
    });
    if (found.length >= limit) break;
  }
  return found;
}
