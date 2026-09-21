// What the local market charges, worked out rather than described.
//
// Everything on this page is arithmetic over prices that were read off real
// pages: the spread, the middle, the quartiles, and where the baker sits in
// them. The model is shown these numbers afterwards and asked to explain them;
// it is never asked what they are.
//
// One rule deserves stating: a bakery gets one vote. A shop listing the same
// cookie in four box sizes would otherwise move the median on its own, so each
// bakery contributes its median listing and no more.

import type { ComparableProduct, MarketStats } from "./types";

/** The value at a percentile, interpolating between neighbours. */
export function percentileOf(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Where a price sits in a set, 0–100. */
export function percentileRank(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0;
  const below = sorted.filter((entry) => entry < value).length;
  const equal = sorted.filter((entry) => entry === value).length;
  return Math.round(((below + equal / 2) / sorted.length) * 100);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(sorted: number[]): number {
  return percentileOf(sorted, 50);
}

/**
 * One price per bakery: the middle of what that bakery offers, so a shop with
 * four box sizes counts once rather than four times.
 */
export function onePricePerBakery(comparables: ComparableProduct[]): number[] {
  const byBakery = new Map<string, number[]>();
  for (const entry of comparables) {
    const list = byBakery.get(entry.bakery.id) || [];
    list.push(entry.equivalentPrice);
    byBakery.set(entry.bakery.id, list);
  }
  return [...byBakery.values()].map((prices) => median([...prices].sort((a, b) => a - b)));
}

/**
 * The market around one of the baker's products, in the baker's own quantity.
 * Returns null when too little was found to describe a market honestly.
 */
export function marketStats(
  comparables: ComparableProduct[],
  userPrice: number,
  currency: string,
  minimumBakeries = 2,
): MarketStats | null {
  if (comparables.length === 0) return null;

  const perBakery = onePricePerBakery(comparables).sort((a, b) => a - b);
  if (perBakery.length < minimumBakeries) return null;

  const total = perBakery.reduce((sum, price) => sum + price, 0);
  const average = total / perBakery.length;
  const middle = median(perBakery);
  const p25 = percentileOf(perBakery, 25);
  const p75 = percentileOf(perBakery, 75);

  return {
    comparableProducts: comparables.length,
    comparableBakeries: perBakery.length,
    min: round(perBakery[0]),
    max: round(perBakery[perBakery.length - 1]),
    average: round(average),
    median: round(middle),
    p25: round(p25),
    p75: round(p75),
    userPercentile: percentileRank(perBakery, userPrice),
    differenceFromMedianPercent:
      middle > 0 ? round(((userPrice - middle) / middle) * 100) : 0,
    differenceFromAveragePercent:
      average > 0 ? round(((userPrice - average) / average) * 100) : 0,
    // the quartiles themselves, named for what they mean to a baker choosing
    // a price rather than for the statistic they are
    suggested: { competitive: round(p25), market: round(middle), premium: round(p75) },
    currency,
  };
}
