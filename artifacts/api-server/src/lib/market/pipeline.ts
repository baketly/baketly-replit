// One price check, start to finish.
//
// Discovery, scanning, matching and the market arithmetic are each their own
// module; this is the order they run in and what is carried between them. The
// route above it does HTTP — rate limits, validation, the response shape — and
// nothing else.

import { discoverNearbyBakeries } from "./discovery";
import { explainMarket, plainNote, type Explanation } from "./explain";
import { compareProducts, type ProductComparison, type UserProduct } from "./compare";
import type { MarketLogger } from "./log";
import { scanBakeries } from "./scan";
import { competitorStore } from "./store";
import type { Bakery, CompetitorProduct } from "./types";

export interface PipelineOptions {
  location: string;
  products: UserProduct[];
  currency: string;
  geminiApiKey: string | null;
  log: MarketLogger;
  radiusKm?: number;
  maxBakeries?: number;
  /** how long the whole check may take before it reports what it has */
  budgetMs?: number;
}

export interface PipelineResult {
  bakeries: Bakery[];
  scannedBakeries: number;
  bakeriesWithProducts: number;
  competitorProducts: number;
  comparisons: ProductComparison[];
  explanation: Explanation;
  /** a plain-language note per product, model or no model */
  noteFor(comparison: ProductComparison): string;
}

/** The whole check. Never throws for a stage failing; it reports what it has. */
export async function runPriceCheck(options: PipelineOptions): Promise<PipelineResult> {
  const { log } = options;
  const deadline = Date.now() + (options.budgetMs ?? 90_000);

  // ---- 1. who is nearby ---------------------------------------------------
  const discovery = await discoverNearbyBakeries(options.location, {
    log,
    radiusKm: options.radiusKm ?? 12,
    limit: options.maxBakeries ?? 15,
  });

  // ---- 2. what they sell --------------------------------------------------
  const withWebsite = discovery.bakeries.filter((bakery) => !!bakery.website);
  const scans = await scanBakeries(withWebsite, {
    log,
    geminiApiKey: options.geminiApiKey,
    localCurrency: options.currency,
    // leave room for the comparison and the explanation
    concurrency: 3,
  });

  // Everything known about these bakeries, not only what this run read: a
  // shop scanned last week still has its prices, and that is the point of
  // keeping them.
  let competitors: CompetitorProduct[] = [];
  try {
    const store = await competitorStore();
    competitors = await store.productsFor(discovery.bakeries.map((bakery) => bakery.id));
  } catch {
    competitors = scans.flatMap((scan) => scan.products);
  }

  // ---- 3. and how it compares --------------------------------------------
  const comparisons = compareProducts(
    options.products,
    competitors,
    discovery.bakeries,
    options.currency,
    log,
  );

  // ---- 4. what that means -------------------------------------------------
  const timeLeft = deadline - Date.now();
  const explanation =
    timeLeft > 5_000
      ? await explainMarket(comparisons, options.currency, options.geminiApiKey, log)
      : { summary: "", notes: new Map<string, string>(), model: null };

  const bakeriesWithProducts = new Set(competitors.map((product) => product.bakeryId)).size;

  return {
    bakeries: discovery.bakeries,
    scannedBakeries: scans.filter((scan) => scan.status === "ok").length,
    bakeriesWithProducts,
    competitorProducts: competitors.length,
    comparisons,
    explanation,
    noteFor(comparison) {
      return explanation.notes.get(comparison.name) || plainNote(comparison, options.currency);
    },
  };
}
