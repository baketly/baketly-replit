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

/**
 * The same listing read twice is one listing.
 *
 * A shop's catalogue and its collection page both carry its cookie tin, and
 * the two readings rarely produce the same string: Shopify appends the variant
 * ("Cookie Tin - 12 Count — Chocolate Chip 'N Chunk / 12 COUNT") where the
 * page shows only the title. Same shop, same price, same count, and one name
 * inside the other is the same product; two different bakes that happen to
 * cost the same are not, and both survive.
 */
export function dedupeListings(entries: ComparableProduct[]): ComparableProduct[] {
  const kept: ComparableProduct[] = [];
  for (const entry of entries) {
    const name = entry.product.normalizedName;
    const at = kept.findIndex((existing) => {
      if (existing.bakery.id !== entry.bakery.id) return false;
      if (existing.product.price !== entry.product.price) return false;
      if ((existing.product.quantity ?? null) !== (entry.product.quantity ?? null)) return false;
      const other = existing.product.normalizedName;
      return name.startsWith(other) || other.startsWith(name) || name === other;
    });
    if (at === -1) {
      kept.push(entry);
      continue;
    }
    // the better-sourced reading stands for the listing
    if (entry.product.confidence > kept[at].product.confidence) kept[at] = entry;
  }
  return kept;
}

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
  // Why something was rejected decides what the screen can honestly say, so
  // the reasons are counted apart rather than totalled.
  //
  // A cafe's bag of coffee beans and its pumpkin spice latte are in the pool
  // because the shop is next door and sells croissants too. They were never
  // candidates for a sourdough, and counting them told the baker "47 products
  // were too different" -- a number that sounds like a thorough search and
  // means nothing. A scone rejected against a croissant is the near miss
  // actually worth mentioning.
  let sameKindRejected = 0;
  let otherKindRejected = 0;
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
      if (candidateReading.category === reading.category) sameKindRejected += 1;
      else otherKindRejected += 1;
      // one example is worth having in the log; all of them is noise
      if (sameKindRejected + otherKindRejected <= 3) {
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

    // A price eight times the baker's, or an eighth of it, is not the same
    // thing at a different price: it is a tray, a catering order, or a typo.
    // Boulder offered a "Chocolate Chunk Cookie" at 175.00 -- a platter with
    // no count on it -- as comparable to a 3.50 cookie, and it would have
    // been the top of the market.
    //
    // Five times, not eight: Asheville's "Plain Croissant" at 30.00 and
    // "Cinnamon Roll" at 36.00 were boxes with no count on them, and at seven
    // times the baker's price they got through. A cake is held tighter still,
    // because its price is mostly its size and a listing without a size can
    // be anything from a slice to a tier. And a plural name with no count --
    // "Chocolate Chunk Cookies" at 25.00 -- is a box however it is priced,
    // so it is held tighter than a single.
    const cakeLike =
      reading.category === "cake" || reading.category === "cheesecake" || reading.category === "pie";
    const boxish =
      !candidate.quantity &&
      /\b(box|boxes|set|pack|bundle|platter|tray|dozen|assorted)\b|[a-z]s$/i.test(
        candidate.name.trim().split(/\s*[(—–|-]\s*/)[0].trim(),
      );
    const spread = boxish ? 3 : cakeLike ? 4 : 5;
    if (unitPrice && (priced.unitPrice > unitPrice * spread || priced.unitPrice < unitPrice / spread)) {
      sameKindRejected += 1;
      log.event("MATCH_REJECTED", {
        productName: product.name,
        bakeryName: bakery.name,
        candidate: candidate.name,
        score: match.matchScore,
        reason:
          "price too far from yours to be the same thing (" +
          priced.unitPrice +
          " vs " +
          unitPrice +
          ")",
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

  const unique = dedupeListings(accepted);

  const stats = marketStats(unique, product.price, currency);
  const ranked = [...unique]
    .sort((a, b) => b.match.matchScore - a.match.matchScore || a.equivalentPrice - b.equivalentPrice)
    .slice(0, MAX_SHOWN);

  if (!stats) {
    const bakeriesWithMatch = new Set(unique.map((entry) => entry.bakery.id)).size;
    const kind = reading.category.replace(/_/g, " ");
    // In order of what it tells the baker to do next: a shop that sells this
    // and hides the price is worth opening, a near miss means the search
    // worked and the bake is unusual, and silence means nobody nearby lists
    // one at all.
    const shortfall =
      unique.length === 0
        ? noPriceCount > 0
          ? "Nearby bakeries sell " + kind + ", but none of them show a price."
          : sameKindRejected > 0
            ? "Nearby bakeries sell " + kind + ", but nothing close enough to compare."
            : "No nearby bakery lists a price for " + kind + "."
        : "Only " +
          bakeriesWithMatch +
          (bakeriesWithMatch === 1 ? " nearby bakery sells" : " nearby bakeries sell") +
          " something comparable — too few to set a local price.";
    log.event("MARKET_CALCULATION_EMPTY", {
      productName: product.name,
      reason: shortfall,
      sameKindRejected,
      otherKindRejected,
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

/**
 * One line per bakery, its closest match, for what is shown to a baker.
 *
 * A shop with a long menu could fill a comparison on its own — three of its
 * cookies reading as three separate opinions about the local price — while
 * the bakery down the road, the one a baker actually wants to see, never
 * appeared at all. The statistics are untouched: they already take one price
 * per bakery, so this is about the telling rather than the arithmetic.
 */
export function oneEachBakery(entries: ComparableProduct[]): ComparableProduct[] {
  // The row shown for a shop has to be the listing the range was built from.
  //
  // The market gives each bakery one vote, its median listing. The row used
  // to be the cheapest of its best matches instead, so a sourdough was told
  // "2 bakeries charge 8.10-11.00" and shown, as the example, a 5.00 loaf
  // from one of them -- a figure the range had never used. Among a shop's
  // best matches, the one nearest its median is the one the numbers mean.
  const pricesByBakery = new Map<string, number[]>();
  for (const entry of entries) {
    const list = pricesByBakery.get(entry.bakery.id) || [];
    list.push(entry.equivalentPrice);
    pricesByBakery.set(entry.bakery.id, list);
  }
  const medianFor = (bakeryId: string): number => {
    const sorted = [...(pricesByBakery.get(bakeryId) || [])].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  const best = new Map<string, ComparableProduct>();
  for (const entry of entries) {
    const held = best.get(entry.bakery.id);
    const median = medianFor(entry.bakery.id);
    const better =
      !held ||
      entry.match.matchScore > held.match.matchScore ||
      (entry.match.matchScore === held.match.matchScore &&
        Math.abs(entry.equivalentPrice - median) < Math.abs(held.equivalentPrice - median));
    if (better) best.set(entry.bakery.id, entry);
  }
  // the entries arrive ranked, and a Map keeps the order it was given
  return [...best.values()];
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
