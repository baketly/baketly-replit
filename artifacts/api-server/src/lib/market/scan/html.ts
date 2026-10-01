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

// The tag's own attributes are kept, so NAMED_CLASS below can ask what the
// page calls this element. Closing tag matched to the opening one: the
// previous pattern would pair a <div> with a </span>.
const NAME_PATTERN =
  /<(h[1-6]|a|span|div|p)\b([^>]*)>([^<>]{3,90})<\/\1>/gi;

/**
 * An element the page itself calls a product's name.
 *
 * "desc" is excluded deliberately: plenty of templates ship a
 * class="product-description", and that is the blurb, not the name.
 */
const NAMED_CLASS = /class=["'][^"']*(?:title|name|product|item|heading)[^"']*["']/i;
const DESC_CLASS = /class=["'][^"']*desc[^"']*["']/i;

function looksNamed(attributes: string): boolean {
  return NAMED_CLASS.test(attributes) && !DESC_CLASS.test(attributes);
}

// The heading a menu section sits under. Only real headings, and only short
// ones: "Donuts", "Breads & Pastries" — never a paragraph that happens to be
// in an h2.
const SECTION_PATTERN = /<h[1-4]\b[^>]*>([^<>]{3,40})<\/h[1-4]>/gi;

/** How far a heading reaches. Past this it is a different part of the menu. */
const SECTION_REACH = 4_000;

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

/**
 * What the shop says about this one product: the text between its name and
 * its price, which on a menu is its own blurb.
 *
 * This is where the category often is. A cookie shop lists "Funfetti" and
 * "S'mores" and never writes the word cookie in a name, because the sentence
 * underneath already says "the buttery, sweet sugar cookie". Sixty-three per
 * cent of everything one sweep read came back as an unreadable name, and
 * those sentences were sitting right there unused.
 *
 * Only the opening is kept. A blurb's first clause names the thing; further
 * in it starts recommending what to drink with it.
 */
function blurbBetween(markup: string): string {
  return decode(markup.replace(/<[^>]*>/g, " ")).slice(0, 160);
}

/**
 * A menu's footnote markers, off the end of a name.
 *
 * Portland's market came back with "Pain au Levain*", where the asterisk
 * points at a line about wheat at the bottom of the page. It is the shop
 * talking to its customers, not part of what the bake is called, and the
 * baker comparing prices is shown it on a row of its own.
 */
function withoutFootnote(value: string): string {
  return value.replace(/[*\u2020\u2021\u00a7]+\s*$/, "").trim();
}

/** A name a person would recognise as a product rather than a button. */
function plausibleName(value: string): boolean {
  const text = value.trim();
  if (text.length < 3 || text.length > 90) return false;
  if (!/[a-z]{3}/i.test(text)) return false;
  if (/^(add to (cart|bag|basket)|buy now|shop now|view|more|read more|select options|sold out|home|menu|order|contact|about)$/i.test(text)) {
    return false;
  }
  // Shop-wide boilerplate that sits near prices on a supermarket's page:
  // "Save $25 weekly with for U", "New Lower Prices Terms & Conditions",
  // "Guaranteed Fresh disclaimer" were all stored as things a bakery sells.
  if (/\b(terms|conditions|disclaimer|coupons?|rewards|weekly ad|sign up|subscribe|save \$|guaranteed)\b/i.test(text)) {
    return false;
  }
  // Shopify themes label the two prices on a sale item, and both labels sit
  // just above a price. The store holds "Regular price" and "Sale price" as
  // things a bakery sells, at 69.00 each.
  if (/^(regular|sale|unit|list|compare at|from|starting at)\s*price$/i.test(text)) {
    return false;
  }
  // a whole sentence is a description, not a product name
  if (text.split(/\s+/).length > 9) return false;
  // Prose gives itself away by its punctuation: "Contains nuts. Delicious
  // peanut butter cookie," is a description that happens to sit near a price.
  if (/[.!?]\s+\S/.test(text)) return false;
  // One sentence with nothing after it got through that, because the rule
  // above wants punctuation in the middle. A shop's blurb sitting in its own
  // paragraph just above the price was then read as the name of the product:
  // "Classic, refreshing soda with a timeless taste." is in the store as a
  // product. A trailing full stop is allowed only on something short enough
  // to be an abbreviation in a name, as in "Ice Cream Co."
  if (/[.!?]$/.test(text) && text.split(/\s+/).length > 5) return false;
  // A product is not a question or an exclamation, and a four-word sentence
  // is still a sentence: "First time shopping with us?" and "Discover our
  // exclusive brands." were a supermarket's banners, stored as its bakes.
  if (/[!?]$/.test(text)) return false;
  if (/\.$/.test(text) && text.split(/\s+/).length > 3) return false;
  if (/[,;:]$/.test(text)) return false;
  if (/^(contains|made with|served|perfect for|our |we )/i.test(text)) return false;
  // A price is not a product. Shops write "from $40.00" above a range, and it
  // was being read as the name of something, then matched against, then
  // rejected — noise all the way through.
  if (/^(from|starting at|only|just|now)?\s*[$€£₪]\s?\d/i.test(text)) return false;
  if (/^\d+(\.\d+)?\s*[$€£₪]/.test(text)) return false;
  // Nor is a price list. "Half $7.95 | Whole $13.00" sat above a loaf's price
  // on a Portland menu and was stored as the name of a bread.
  if ((text.match(/[$€£₪]\s?\d/g) || []).length >= 2) return false;
  if (/^(half|whole|small|medium|large|mini|regular|single|dozen)\b[^a-z]*[$€£₪]?\s?\d/i.test(text)) {
    return false;
  }
  // Neither is a size or a weight on its own: "12 oz", "500g", "Large".
  if (/^\d+\s*(g|kg|oz|lb|ml|l|cm|in|pc|pcs|pack)\b/i.test(text)) return false;
  if (/^(small|medium|large|regular|half|whole|single|dozen|half dozen)$/i.test(text)) return false;
  // "Pure, crisp hydration, essential for any moment" is a sentence about a
  // bottle of water; a product name does not have clauses in it.
  if (/,\s+[a-z]/.test(text)) return false;
  if ((text.match(/,/g) || []).length > 1) return false;
  return true;
}

function build(
  name: string,
  priceText: string,
  sourceUrl: string,
  sourceType: SourceType,
  confidence: number,
  pageCurrency: string | null,
  /** the page this was read from — "…/collections/donuts" says what it is */
  categoryHint: string | null = null,
): ExtractedProduct | null {
  const key = normalizedNameKey(name);
  if (!key) return null;
  const parsed = parsePrice(priceText, pageCurrency);
  if (!parsed) return null;
  const reading = normalizeProduct(name, null, categoryHint);
  // A price that says "from" belongs to the cheapest version of something,
  // which is not the same as the price of the thing named.
  const confidenceForPrice = parsed.isFrom ? Math.min(confidence, 0.5) : confidence;
  return {
    name: withoutFootnote(name).slice(0, 200),
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
  // No category is taken from the page itself. A bakery's menu page holds its
  // cold brew and its bottled water as well as its bread, and a page-wide
  // "these are loaves" turned Topo Chico into a sourdough. Where a platform
  // states a type per product — Shopify does — that is used instead; here,
  // only what the product's own name says counts.

  // every candidate name and where it sits on the page
  const names: Array<{ at: number; text: string; named: boolean }> = [];
  let nameMatch: RegExpExecArray | null;
  NAME_PATTERN.lastIndex = 0;
  while ((nameMatch = NAME_PATTERN.exec(cleaned)) !== null) {
    const text = decode(nameMatch[3]!);
    if (plausibleName(text)) {
      names.push({ at: nameMatch.index, text, named: looksNamed(nameMatch[2] || "") });
    }
  }
  if (names.length === 0) return [];

  // Where each menu section starts, so a product whose own name says nothing
  // can borrow the heading above it. This is why "Glazed" and "Boston Cream"
  // under a Donuts heading were being thrown away: forty-two candidates on one
  // check, rejected for having no category, which is how a menu is written.
  //
  // Deliberately the nearest heading rather than anything page-wide. A
  // page-wide category once made a bottle of Topo Chico a sourdough; a heading
  // four thousand characters above a price is a section, not a page.
  const sections: Array<{ at: number; text: string }> = [];
  let sectionMatch: RegExpExecArray | null;
  SECTION_PATTERN.lastIndex = 0;
  while ((sectionMatch = SECTION_PATTERN.exec(cleaned)) !== null) {
    sections.push({ at: sectionMatch.index, text: decode(sectionMatch[1]) });
  }

  const sectionFor = (at: number): string | null => {
    let found: string | null = null;
    for (const section of sections) {
      if (section.at >= at) break;
      if (at - section.at > SECTION_REACH) continue;
      found = section.text;
    }
    return found;
  };

  const found: ExtractedProduct[] = [];
  const seen = new Set<string>();
  let priceMatch: RegExpExecArray | null;
  PRICE_PATTERN.lastIndex = 0;
  while ((priceMatch = PRICE_PATTERN.exec(cleaned)) !== null && found.length < limit) {
    const at = priceMatch.index;
    // Within a card's worth of markup before the price: the nearest element
    // the page calls a name, and only failing that the nearest of anything.
    //
    // Nearest alone put the blurb ahead of the name, because a shop writes
    // the description between the two. The scanner read "Classic, refreshing
    // soda with a timeless taste." as a product, priced it, and offered it to
    // the matcher.
    let nearestNamed: { at: number; text: string; named: boolean } | null = null;
    let nearestAny: { at: number; text: string; named: boolean } | null = null;
    for (const candidate of names) {
      if (candidate.at >= at) break;
      if (at - candidate.at > 1_200) continue;
      nearestAny = candidate;
      if (candidate.named) nearestNamed = candidate;
    }
    const nearest = nearestNamed || nearestAny;
    if (!nearest) continue;
    const key = normalizedNameKey(nearest.text);
    if (seen.has(key)) continue;
    // A section heading is the better evidence where a page has one; this
    // page had none, because site builders make headings out of styled divs.
    // The product's own blurb is the fallback, and it is still the shop's own
    // words about this exact product rather than anything page-wide.
    //
    // Safe as a hint because normalizeProduct consults a hint only when the
    // name says nothing, and only for the words that name a bake: a blurb
    // cannot turn a named cookie into something else, and cannot make
    // anything a drink.
    const product = build(
      nearest.text,
      priceMatch[0],
      sourceUrl,
      "html",
      0.6,
      pageCurrency,
      sectionFor(at) || blurbBetween(cleaned.slice(nearest.at, at)),
    );
    if (product) {
      seen.add(key);
      found.push(product);
    }
  }

  return found;
}
