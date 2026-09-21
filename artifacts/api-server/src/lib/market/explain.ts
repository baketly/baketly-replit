// What the numbers mean, in a sentence a baker would say.
//
// By the time this runs, every number is already decided: the median, the
// spread, the baker's distance from it, how many shops it came from. The model
// is given those numbers and asked to say what they mean. It is not asked what
// the market charges, and it cannot change a figure — anything it returns is
// prose, and the screen shows the computed numbers beside it either way.

import { generateJson, GeminiProviderError } from "../gemini";
import type { MarketLogger } from "./log";
import type { ProductComparison } from "./compare";

const EXPLANATION_RULES = [
  "You are Baketly, advising one home baker about their prices. You are given the results of a price comparison that has already been calculated from real listings on nearby bakeries' websites.",
  "Every number in the input is a fact. Use the numbers given and no others. Never state a price, a median, a count or a percentage that is not in the input, and never adjust one.",
  "Do not describe bakeries, neighbourhoods, seasons, ingredients or costs. You know nothing beyond this input.",
  "For each product write one or two plain sentences: where their price sits against the local median, what nearby shops charge for the equivalent, and what that suggests. Name the suggested range only from the numbers given.",
  "A comparison drawn from few bakeries deserves a note of caution rather than a confident recommendation.",
  "Write the way a person speaks: no markdown, no bullet points, no headings, no exclamation marks.",
  "The summary is one sentence about the check as a whole.",
].join(" ");

const explanationSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    products: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: ["name", "note"],
      },
    },
  },
  required: ["summary", "products"],
} as const;

export interface Explanation {
  summary: string;
  notes: Map<string, string>;
  model: string | null;
}

/** The numbers, and nothing else, as the model will see them. */
function inputFor(comparisons: ProductComparison[], currency: string): string {
  const withMarket = comparisons.filter((entry) => entry.stats);
  return JSON.stringify(
    {
      currency,
      products: withMarket.map((entry) => ({
        name: entry.name,
        user_price: entry.price,
        user_price_per_item: entry.unitPrice,
        quantity: entry.reading.quantity ?? 1,
        market: {
          median: entry.stats?.median,
          average: entry.stats?.average,
          min: entry.stats?.min,
          max: entry.stats?.max,
          p25: entry.stats?.p25,
          p75: entry.stats?.p75,
          difference_from_median_percent: entry.stats?.differenceFromMedianPercent,
          user_percentile: entry.stats?.userPercentile,
          comparable_bakeries: entry.stats?.comparableBakeries,
          comparable_products: entry.stats?.comparableProducts,
          suggested: entry.stats?.suggested,
        },
      })),
    },
    null,
    1,
  );
}

/**
 * A note per product and a summary. Never throws: without an explanation the
 * screen still shows every number, which is the part that matters.
 */
export async function explainMarket(
  comparisons: ProductComparison[],
  currency: string,
  apiKey: string | null,
  log: MarketLogger,
): Promise<Explanation> {
  const empty: Explanation = { summary: "", notes: new Map(), model: null };
  if (!apiKey) return empty;
  const withMarket = comparisons.filter((entry) => entry.stats);
  if (withMarket.length === 0) return empty;

  try {
    const response = await generateJson({
      apiKey,
      parts: [{ text: EXPLANATION_RULES + "\n\nComparison results:\n" + inputFor(comparisons, currency) }],
      responseSchema: explanationSchema,
      temperature: 0.2,
      maxOutputTokens: 2048,
      attemptTimeoutMs: 20_000,
      budgetMs: 25_000,
    });

    const parsed = JSON.parse(response.text) as { summary?: unknown; products?: unknown };
    const notes = new Map<string, string>();
    for (const entry of Array.isArray(parsed.products) ? parsed.products : []) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name : "";
      const note = typeof row.note === "string" ? row.note.trim().slice(0, 320) : "";
      if (name && note) notes.set(name, note);
    }

    log.event("AI_EXPLANATION_COMPLETE", { model: response.model, count: notes.size });
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 400) : "",
      notes,
      model: response.model,
    };
  } catch (error) {
    log.event("AI_EXPLANATION_FAILED", {
      reason:
        error instanceof GeminiProviderError
          ? "gemini " + error.status
          : error instanceof Error
            ? error.message
            : "unknown",
    });
    return empty;
  }
}

/** What to say when there is no model, written from the numbers themselves. */
export function plainNote(entry: ProductComparison, currency: string): string {
  if (!entry.stats) return entry.shortfall || "No local prices found for this one.";
  const money = (value: number) => currency + value.toFixed(2);
  const difference = entry.stats.differenceFromMedianPercent;
  const direction =
    Math.abs(difference) < 3
      ? "about the same as"
      : difference < 0
        ? Math.abs(difference).toFixed(0) + "% below"
        : difference.toFixed(0) + "% above";
  return (
    "You charge " +
    direction +
    " the local median of " +
    money(entry.stats.median) +
    ", from " +
    entry.stats.comparableBakeries +
    (entry.stats.comparableBakeries === 1 ? " bakery" : " bakeries") +
    " charging " +
    money(entry.stats.min) +
    " to " +
    money(entry.stats.max) +
    "."
  );
}
