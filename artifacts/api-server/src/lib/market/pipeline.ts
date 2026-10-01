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
import { normalizeProduct } from "./normalize";
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

/** A bakery whose website could not be read, for the baker to look at. */
export interface UnreadBakery {
  name: string;
  website: string;
  distanceKm: number | null;
  /** why, in words a baker would use */
  reason: string;
}

export interface PipelineResult {
  bakeries: Bakery[];
  /** which providers answered: google, osm, or both */
  discoveredBy: Array<"google" | "osm">;
  scannedBakeries: number;
  bakeriesWithProducts: number;
  competitorProducts: number;
  comparisons: ProductComparison[];
  explanation: Explanation;
  /** nearby shops with a website we could not price from */
  unread: UnreadBakery[];
  /** a plain-language note per product, model or no model */
  noteFor(comparison: ProductComparison): string;
}

/** Why a scan produced nothing, said the way a person would say it. */
function unreadReason(status: string, error: string | null): string {
  if (error) {
    if (error.includes("none with a price")) {
      return "their prices load in the browser, so nothing could be read";
    }
    if (error.includes("timed out")) return "their website took too long to answer";
    if (/status [45]/.test(error)) return "their website turned Baketly away";
  }
  if (status === "failed") return "their website could not be reached";
  // Not "they publish no prices": most of these shops do, somewhere Baketly
  // could not follow. Claiming otherwise would be telling the baker something
  // about a competitor that may not be true.
  return "no prices Baketly could read there";
}

/** The whole check. Never throws for a stage failing; it reports what it has. */
export async function runPriceCheck(options: PipelineOptions): Promise<PipelineResult> {
  const { log } = options;
  const deadline = Date.now() + (options.budgetMs ?? 90_000);

  // ---- 1. who is nearby ---------------------------------------------------
  // Told what the baker sells, so it looks for the shops that sell it. The
  // twenty nearest places Google tags "bakery" in a town centre are coffee
  // shops, doughnut counters and a creamery; a baker of loaves is competing
  // with the bread bakeries a mile out, and those have to be asked for.
  const kinds = [
    ...new Set(
      options.products
        .map((product) => normalizeProduct(product.name).category)
        .filter((category) => category !== "unknown"),
    ),
  ];
  const discovery = await discoverNearbyBakeries(options.location, {
    log,
    radiusKm: options.radiusKm ?? 12,
    limit: options.maxBakeries ?? 15,
    kinds,
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

  // "Products read" means bakes to the baker reading it.
  //
  // A cafe two doors down sells croissants, and it puts its bags of coffee
  // beans and its pumpkin spice lattes in the same catalogue. Counting those
  // told a baker in Boulder that the search had read 47 products when most of
  // them could never be priced against a bake. Sandwiches and quiche stay
  // counted: those are the shop's own baking, whatever else they are.
  const bakesRead = competitors.filter((product) => {
    const reading = normalizeProduct(product.name, product.description, product.category);
    // Excluding what could not be read at all, as well as the drinks and the
    // merchandise. A coffee roaster attached to a bakery sells beans named
    // Stella and Bareknuckle, a Chemex, an AeroPress and two t-shirts, and
    // none of those reads as anything -- so "unknown" was carrying them into
    // a count of bakes. What the baker is being told is how much of the
    // neighbours' baking Baketly actually understood, and an item it could
    // not read is not part of that.
    return (
      reading.category !== "unknown" &&
      reading.category !== "drink" &&
      reading.category !== "not_food"
    );
  }).length;

  // A shop whose site we could not price is not a dead end: the baker can
  // open it and look. Worth handing them the address rather than dropping the
  // shop from the report entirely.
  const priced = new Set(competitors.map((product) => product.bakeryId));
  const unread: UnreadBakery[] = withWebsite
    .filter((bakery) => !priced.has(bakery.id))
    .map((bakery) => {
      const scan = scans.find((entry) => entry.bakeryId === bakery.id);
      return {
        name: bakery.name,
        website: bakery.website as string,
        distanceKm: bakery.distanceKm,
        reason: unreadReason(scan?.status || "failed", scan?.error ?? null),
      };
    })
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

  return {
    bakeries: discovery.bakeries,
    // which providers actually answered, carried out to the response: without
    // it, whether Google Places is configured and working can only be learned
    // from server logs, and those are not always reachable
    discoveredBy: discovery.sources,
    scannedBakeries: scans.filter((scan) => scan.status === "ok").length,
    bakeriesWithProducts,
    competitorProducts: bakesRead,
    comparisons,
    explanation,
    unread,
    noteFor(comparison) {
      return explanation.notes.get(comparison.name) || plainNote(comparison, options.currency);
    },
  };
}
