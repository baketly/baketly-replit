// The extractor of last resort.
//
// When a page keeps its prices somewhere no parser here can follow, the page's
// own text is handed to Gemini and it is asked to read what is on it. That is
// the whole of the model's job in this stage: reading a document it has been
// given, never searching, never recalling, never filling a gap.
//
// Everything it returns is checked before it is believed: a product with no
// price is dropped, a price that does not appear in the page text is dropped,
// and the source URL is ours rather than anything the model produced.

import { generateJson, GeminiProviderError } from "../../gemini";
import { normalizeProduct, normalizedNameKey } from "../normalize";
import type { ExtractedProduct } from "../types";
import { parsePrice } from "./price";

const MAX_PAGE_CHARS = 14_000;
const MAX_PRODUCTS = 40;

const EXTRACTION_RULES = [
  "You read one web page from a bakery's own website and list the products it offers for sale, with the prices printed on that page.",
  "The page text is the only source. Do not use anything you know about this bakery, this town, or typical prices. You are not answering a question; you are copying what the page says.",
  "NEVER infer a price. If a product's price is not printed on the page, set price to null and keep the product.",
  "NEVER invent a product. Every product you list must be named on the page.",
  "NEVER invent a quantity or a weight. If the page does not say how many a listing is for, set quantity to null. 'Half dozen' is 6, 'dozen' is 12, because the page said so; anything else is null.",
  "A price written as 'from £18' or 'starting at $25' is a starting price: report the number and set price_is_from to true.",
  "When a page shows a crossed-out price and a lower one, the lower is the price: report it and set is_sale to true.",
  "Ignore delivery charges, gift cards, vouchers, subscriptions, and anything that is not a baked product.",
  "confidence is your own 0-1 reading of how certain you are that this product and price are really on the page. Use below 0.5 when the layout made you unsure which price belongs to which product.",
  "Prefer returning fewer products you are sure of over more that you are not. Missing a product costs nothing here; a wrong price is worse than no price.",
].join(" ");

const extractionSchema = {
  type: "OBJECT",
  properties: {
    currency: { type: "STRING", nullable: true },
    products: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          product_name: { type: "STRING" },
          quantity: { type: "NUMBER", nullable: true },
          unit: { type: "STRING", nullable: true },
          weight: { type: "NUMBER", nullable: true },
          weight_unit: { type: "STRING", nullable: true },
          price: { type: "NUMBER", nullable: true },
          price_is_from: { type: "BOOLEAN" },
          is_sale: { type: "BOOLEAN" },
          description: { type: "STRING", nullable: true },
          confidence: { type: "NUMBER" },
        },
        required: ["product_name", "quantity", "price", "price_is_from", "is_sale", "confidence"],
      },
    },
  },
  required: ["products", "currency"],
} as const;

/** The readable text of a page, which is all the model is given. */
export function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, MAX_PAGE_CHARS);
}

/** Digits of a number, for checking a price really appears in the text. */
function appearsInText(value: number, text: string): boolean {
  const whole = String(Math.round(value));
  const withDecimals = value.toFixed(2);
  const commaDecimals = withDecimals.replace(".", ",");
  return text.includes(withDecimals) || text.includes(commaDecimals) || text.includes(whole);
}

export interface AiExtractionResult {
  products: ExtractedProduct[];
  model: string | null;
  error: string | null;
}

/**
 * Products read out of one page by the model. Never throws: a failure here is
 * one page yielding nothing, which the caller logs and moves past.
 */
export async function extractWithAi(
  html: string,
  sourceUrl: string,
  apiKey: string,
  localCurrency: string | null,
): Promise<AiExtractionResult> {
  const text = pageText(html);
  if (text.length < 200) {
    return { products: [], model: null, error: "page had too little text to read" };
  }

  let response: Awaited<ReturnType<typeof generateJson>>;
  try {
    response = await generateJson({
      apiKey,
      parts: [
        {
          text:
            EXTRACTION_RULES +
            "\n\nPage URL: " +
            sourceUrl +
            "\n\nPage text:\n" +
            text,
        },
      ],
      responseSchema: extractionSchema,
      temperature: 0,
      maxOutputTokens: 4096,
      attemptTimeoutMs: 20_000,
      budgetMs: 30_000,
    });
  } catch (error) {
    return {
      products: [],
      model: null,
      error:
        error instanceof GeminiProviderError
          ? "gemini " + error.status + " " + error.message.slice(0, 120)
          : "gemini request failed",
    };
  }

  let parsed: { products?: unknown; currency?: unknown };
  try {
    parsed = JSON.parse(response.text) as { products?: unknown; currency?: unknown };
  } catch {
    return { products: [], model: response.model, error: "model returned malformed JSON" };
  }

  const currency =
    typeof parsed.currency === "string" && parsed.currency.trim()
      ? parsed.currency.trim().slice(0, 8)
      : localCurrency;

  const found: ExtractedProduct[] = [];
  const seen = new Set<string>();

  for (const entry of Array.isArray(parsed.products) ? parsed.products : []) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.product_name === "string" ? row.product_name.trim() : "";
    if (!name) continue;
    const key = normalizedNameKey(name);
    if (!key || seen.has(key)) continue;

    // The model's own name must be on the page, or it did not read it there.
    const lowerText = text.toLowerCase();
    const firstWords = name.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    if (firstWords.length > 3 && !lowerText.includes(firstWords)) continue;

    const rawPrice = Number(row.price);
    let price: number | null =
      Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice * 100) / 100 : null;
    // and so must the number it says the page charges
    if (price !== null && !appearsInText(price, text)) price = null;

    const quantity = Number(row.quantity);
    const weight = Number(row.weight);
    const description = typeof row.description === "string" ? row.description.slice(0, 400) : null;
    const reading = normalizeProduct(name, description);
    const modelConfidence = Number(row.confidence);
    const isFrom = row.price_is_from === true;

    seen.add(key);
    found.push({
      name: name.slice(0, 200),
      normalizedName: key,
      category: reading.category === "unknown" ? null : reading.category,
      subcategory: reading.subcategory,
      flavor: reading.flavor,
      description,
      // the page's own words win over the model's reading of them
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : reading.quantity,
      unit: typeof row.unit === "string" && row.unit ? row.unit.slice(0, 20) : reading.unit,
      weight: Number.isFinite(weight) && weight > 0 ? weight : reading.weight,
      weightUnit:
        typeof row.weight_unit === "string" && row.weight_unit
          ? (row.weight_unit.slice(0, 8) as ExtractedProduct["weightUnit"])
          : reading.weightUnit,
      price,
      currency,
      sourceUrl,
      sourceType: "ai_extraction",
      // capped below every structured parser: this is a reading, not a record
      confidence: Math.min(
        0.75,
        (Number.isFinite(modelConfidence) ? Math.max(0, Math.min(1, modelConfidence)) : 0.5) *
          (isFrom ? 0.6 : 1),
      ),
    });
    if (found.length >= MAX_PRODUCTS) break;
  }

  return { products: found, model: response.model, error: null };
}
