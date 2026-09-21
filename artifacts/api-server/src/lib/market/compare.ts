// One of the baker's products, against everything the neighbours sell.
//
// This is where the stages meet: the baker's product is read the same way a
// competitor's was, every stored listing is scored against it, the ones that
// are genuinely comparable are priced into the baker's own quantity, and the
// market is calculated from those. What comes out carries its workings — which
// listing, from which shop, at which URL, and why it counted.

import type { MarketLogger } from "./log";
import { ACCEPT_THRESHOLD, matchProducts } from "./matching";
import { normalizeProduct } from "./normalize";
import { normalizePrice, userUnitPrice } from "./pricing";
import { marketStats } from "./stats";
import type {
  Bakery,
  ComparableProduct,
  CompetitorProduct,
  MarketStats,
  NormalizedProduct,
} from "./types";

export interface UserProduct {
  name: string;
  price: number;
}

export interface ProductComparison {
  name: string;
  price: number;
  /** the baker's own price per item */
  unitPrice: number | null;
  reading: NormalizedProduct;
  stats: MarketStats | null;
  comparables: ComparableProduct[];
  /** why nothing could be said, when nothing could */
  shortfall: string | null;
}

/** How many competitor rows to keep for the screen, best match first. */
const MAX_SHOWN = 12;

export function compareProduct(
  product: UserProduct,
  competitors: CompetitorProduct[],
  bakeriesById: Map<string, Bakery>,
  currency: string,
  log: MarketLogger,
): ProductComparison {
  const reading = normalizeProduct(product.name);
  const unitPrice = userUnitPrice(product.price, reading);
  const userQuantity = reading.quantity && reading.quantity > 0 ? reading.quantity : 1;

  if (reading.category === "unknown") {
    log.event("MARKET_CALCULATION_EMPTY", {
      productName: product.name,
      reason: "could not tell what kind of product this is",
    });
    return {
      name: product.name,
      price: product.price,
      unitPrice,
      reading,
      stats: null,
      comparables: [],
      shortfall: "Baketly could not tell what kind of bake this is from its name.",
    };
  }

  const accepted: ComparableProduct[] = [];
  let rejectedCount = 0;
  let noPriceCount = 0;

  for (const candidate of competitors) {
    const bakery = bakeriesById.get(candidate.bakeryId);
    if (!bakery) continue;

    const candidateReading = normalizeProduct(
      candidate.name,
      candidate.description,
      candidate.category,
    );
    const match = matchProducts(reading, candidateReading);
    if (match.matchScore < ACCEPT_THRESHOLD) {
      rejectedCount += 1;
      // one example is worth having in the log; all of them is noise
      if (rejectedCount <= 3) {
        log.event("MATCH_REJECTED", {
          productName: product.name,
          bakeryName: bakery.name,
          candidate: candidate.name,
          score: match.matchScore,
          reason: match.rejections[0] || "not comparable",
        });
      }
      continue;
    }

    const priced = normalizePrice(candidate, userQuantity);
    if (!priced) {
      noPriceCount += 1;
      log.event("PRICE_NORMALIZATION_FAILED", {
        productName: candidate.name,
        bakeryName: bakery.name,
        url: candidate.sourceUrl,
        reason: "no usable price",
      });
      continue;
    }

    log.event("MATCH_ACCEPTED", {
      productName: product.name,
      bakeryName: bakery.name,
      candidate: candidate.name,
      score: match.matchScore,
      url: candidate.sourceUrl,
    });
    log.event("PRICE_NORMALIZED", {
      productName: candidate.name,
      unitPrice: priced.unitPrice,
      equivalentPrice: priced.equivalentPrice,
      assumedSingle: priced.assumedSingle,
    });

    accepted.push({
      product: candidate,
      bakery,
      match,
      unitPrice: priced.unitPrice,
      equivalentPrice: priced.equivalentPrice,
    });
  }

  const stats = marketStats(accepted, product.price, currency);
  const ranked = [...accepted]
    .sort((a, b) => b.match.matchScore - a.match.matchScore || a.equivalentPrice - b.equivalentPrice)
    .slice(0, MAX_SHOWN);

  if (!stats) {
    const bakeriesWithMatch = new Set(accepted.map((entry) => entry.bakery.id)).size;
    const shortfall =
      accepted.length === 0
        ? rejectedCount > 0
          ? "Nothing comparable found nearby: " + rejectedCount + " products were too different."
          : "No nearby bakery published prices for this kind of bake."
        : "Only " + bakeriesWithMatch + " nearby bakery sells something comparable, which is too few to call a local price.";
    log.event("MARKET_CALCULATION_EMPTY", {
      productName: product.name,
      reason: shortfall,
      rejected: rejectedCount,
      unpriced: noPriceCount,
    });
    return { name: product.name, price: product.price, unitPrice, reading, stats: null, comparables: ranked, shortfall };
  }

  log.event("MARKET_CALCULATION_COMPLETE", {
    productName: product.name,
    bakeries: stats.comparableBakeries,
    products: stats.comparableProducts,
    median: stats.median,
    userPrice: product.price,
    differencePercent: stats.differenceFromMedianPercent,
  });

  return { name: product.name, price: product.price, unitPrice, reading, stats, comparables: ranked, shortfall: null };
}

/** Every product the baker asked about, against the same stored market. */
export function compareProducts(
  products: UserProduct[],
  competitors: CompetitorProduct[],
  bakeries: Bakery[],
  currency: string,
  log: MarketLogger,
): ProductComparison[] {
  const bakeriesById = new Map(bakeries.map((bakery) => [bakery.id, bakery]));
  return products.map((product) =>
    compareProduct(product, competitors, bakeriesById, currency, log),
  );
}
