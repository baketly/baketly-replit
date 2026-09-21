// Products a site has already described in machine-readable form.
//
// Schema.org Product/Offer markup is what Google reads to show a price in
// search results, so shops that care about being found publish it: the name,
// the price and the currency, stated rather than inferred. It is the best
// source we have and the first one tried.

import { normalizeProduct, normalizedNameKey } from "../normalize";
import type { ExtractedProduct } from "../types";
import { parsePrice } from "./price";

type Json = Record<string, unknown>;

const SCRIPT_PATTERN =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function isType(node: Json, wanted: string): boolean {
  return asArray(node["@type"]).some(
    (type) => typeof type === "string" && type.toLowerCase() === wanted,
  );
}

/** Every node in a JSON-LD document, including the ones nested in graphs. */
function* walk(node: unknown, depth = 0): Generator<Json> {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const entry of node) yield* walk(entry, depth + 1);
    return;
  }
  const object = node as Json;
  yield object;
  for (const value of Object.values(object)) {
    if (value && typeof value === "object") yield* walk(value, depth + 1);
  }
}

/** The price of an offer, or of the cheapest offer when there are several. */
function offerPrice(node: Json): { price: number | null; currency: string | null } {
  const offers = asArray(node.offers).filter(
    (offer): offer is Json => !!offer && typeof offer === "object",
  );
  let best: number | null = null;
  let currency: string | null = null;

  for (const offer of offers) {
    const currencyCode = text(offer.priceCurrency) || text(offer.priceSpecification);
    const raw =
      text(offer.price) ??
      text(offer.lowPrice) ??
      text((offer.priceSpecification as Json | undefined)?.price);
    if (!raw) continue;
    const parsed = parsePrice(raw, currencyCode);
    if (!parsed) continue;
    if (best === null || parsed.price < best) {
      best = parsed.price;
      currency = parsed.currency || currencyCode;
    }
  }
  return { price: best, currency };
}

/**
 * Products described in a page's JSON-LD. Only ones with a name, and only
 * prices the markup itself states; anything else is left to the next parser.
 */
export function extractJsonLd(html: string, sourceUrl: string): ExtractedProduct[] {
  const found: ExtractedProduct[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  SCRIPT_PATTERN.lastIndex = 0;
  while ((match = SCRIPT_PATTERN.exec(html)) !== null) {
    let parsed: unknown;
    try {
      // some sites wrap their JSON-LD in CDATA or trailing commas
      parsed = JSON.parse(match[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim());
    } catch {
      continue;
    }

    for (const node of walk(parsed)) {
      if (!isType(node, "product")) continue;
      const name = text(node.name);
      if (!name) continue;
      const key = normalizedNameKey(name);
      if (!key || seen.has(key)) continue;

      const { price, currency } = offerPrice(node);
      const description = text(node.description);
      const reading = normalizeProduct(name, description);
      seen.add(key);
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
        price,
        currency,
        sourceUrl,
        sourceType: "jsonld",
        // stated by the site itself, in a format meant to be read
        confidence: price === null ? 0.5 : 0.95,
      });
    }
  }

  return found;
}
