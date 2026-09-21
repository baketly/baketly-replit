import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePrice, toOunces, userUnitPrice } from "./pricing";
import { normalizeProduct } from "./normalize";
import { marketStats, onePricePerBakery, percentileOf, percentileRank } from "./stats";
import type { Bakery, ComparableProduct, CompetitorProduct } from "./types";

function competitor(
  price: number | null,
  quantity: number | null,
  extra: Partial<CompetitorProduct> = {},
) {
  return { price, quantity, weight: null, weightUnit: null, ...extra } as CompetitorProduct;
}

test("a price becomes a price per item", () => {
  // the baker: 6 cookies for $18
  assert.equal(userUnitPrice(18, normalizeProduct("Box of 6 Chocolate Chip Cookies")), 3);

  // a competitor: 12 for $30 is $2.50 each, and $15 for the baker's six
  const twelve = normalizePrice(competitor(30, 12), 6);
  assert.equal(twelve?.unitPrice, 2.5);
  assert.equal(twelve?.equivalentPrice, 15);

  // one for $4.50 is $4.50 each, and $27 for six
  const single = normalizePrice(competitor(4.5, 1), 6);
  assert.equal(single?.unitPrice, 4.5);
  assert.equal(single?.equivalentPrice, 27);
});

test("an unstated quantity is priced as one, and says so", () => {
  const unknown = normalizePrice(competitor(4, null), 6);
  assert.equal(unknown?.unitPrice, 4);
  assert.equal(unknown?.assumedSingle, true);
});

test("a listing with no price is not a price", () => {
  assert.equal(normalizePrice(competitor(null, 6), 6), null);
  assert.equal(normalizePrice(competitor(0, 6), 6), null);
  assert.equal(normalizePrice(competitor(-5, 6), 6), null);
});

test("weights convert so price per pound compares", () => {
  assert.equal(toOunces(1, "lb"), 16);
  assert.equal(Math.round(toOunces(500, "g") ?? 0), 18);
  const loaf = normalizePrice(competitor(8, 1, { weight: 750, weightUnit: "g" }), 1);
  assert.ok(loaf?.pricePerPound && loaf.pricePerPound > 4 && loaf.pricePerPound < 6);
});

test("percentiles and rank", () => {
  const sorted = [15, 18, 20, 24, 30];
  assert.equal(percentileOf(sorted, 50), 20);
  assert.equal(percentileOf(sorted, 25), 18);
  assert.equal(percentileOf(sorted, 75), 24);
  assert.equal(percentileRank(sorted, 15), 10);
  assert.equal(percentileRank(sorted, 30), 90);
});

function comparable(bakeryId: string, equivalentPrice: number): ComparableProduct {
  return {
    product: competitor(equivalentPrice, 1),
    bakery: { id: bakeryId } as Bakery,
    match: { matchScore: 0.9, matchQuality: "high", reasons: [], rejections: [] },
    unitPrice: equivalentPrice,
    equivalentPrice,
  };
}

test("one bakery cannot move the market on its own", () => {
  // four listings from one shop, one from another
  const prices = onePricePerBakery([
    comparable("a", 40),
    comparable("a", 42),
    comparable("a", 44),
    comparable("a", 46),
    comparable("b", 20),
  ]);
  assert.equal(prices.length, 2);
  assert.deepEqual(prices.sort((x, y) => x - y), [20, 43]);
});

test("the market around the baker's own price", () => {
  const stats = marketStats(
    [
      comparable("a", 15),
      comparable("b", 18),
      comparable("c", 20),
      comparable("d", 24),
      comparable("e", 30),
    ],
    18,
    "USD",
  );
  assert.ok(stats);
  assert.equal(stats.comparableBakeries, 5);
  assert.equal(stats.median, 20);
  assert.equal(stats.min, 15);
  assert.equal(stats.max, 30);
  assert.equal(stats.average, 21.4);
  assert.equal(stats.differenceFromMedianPercent, -10);
  assert.equal(stats.suggested.competitive, 18);
  assert.equal(stats.suggested.market, 20);
  assert.equal(stats.suggested.premium, 24);
});

test("one bakery is not a market", () => {
  assert.equal(marketStats([comparable("a", 20)], 18, "USD"), null);
});
