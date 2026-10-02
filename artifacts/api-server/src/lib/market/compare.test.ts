import assert from "node:assert/strict";
import { test } from "node:test";
import { oneEachBakery, compareProduct } from "./compare";
import { marketLogger } from "./log";
import type { Bakery, CompetitorProduct } from "./types";

const silent = marketLogger({ info() {}, warn() {} } as never, "chk_test");

function bakery(id: string, name: string): Bakery {
  return {
    id,
    googlePlaceId: null,
    osmId: null,
    name,
    normalizedName: name.toLowerCase(),
    address: null,
    city: null,
    region: null,
    country: null,
    latitude: null,
    longitude: null,
    website: "https://" + id + ".example",
    domain: id + ".example",
    rating: null,
    reviewCount: null,
    distanceKm: 2,
    discoverySource: "osm",
    lastDiscoveredAt: new Date().toISOString(),
    lastScannedAt: null,
  };
}

let counter = 0;
function product(
  bakeryId: string,
  name: string,
  price: number | null,
  quantity: number | null,
  extra: Partial<CompetitorProduct> = {},
): CompetitorProduct {
  counter += 1;
  return {
    id: "cp_" + counter,
    bakeryId,
    name,
    normalizedName: name.toLowerCase(),
    category: null,
    subcategory: null,
    flavor: null,
    description: null,
    quantity,
    unit: null,
    weight: null,
    weightUnit: null,
    price,
    currency: "USD",
    normalizedUnitPrice: price !== null && quantity ? price / quantity : price,
    sourceUrl: "https://" + bakeryId + ".example/products/" + counter,
    sourceType: "jsonld",
    confidence: 0.95,
    active: true,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...extra,
  };
}

const bakeries = new Map([
  ["a", bakery("a", "Alpha Bakes")],
  ["b", bakery("b", "Beta Bakery")],
  ["c", bakery("c", "Gamma Cakes")],
]);

test("a market is built only from comparable products", () => {
  const competitors = [
    product("a", "Half Dozen Chocolate Chip Cookies", 21, 6),
    product("b", "12 Chocolate Chunk Cookies", 30, 12), // $15 for six
    product("c", "Chocolate Chip Cookie", 4, 1), // $24 for six
    product("a", "Giant Chocolate Chip Cookie Cake", 48, 1), // not a cookie
    product("b", "Mini Cookie Party Tray", 60, 40), // not comparable
  ];
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    competitors,
    bakeries,
    "USD",
    silent,
  );

  assert.ok(result.stats, "expected a market");
  assert.equal(result.stats.comparableBakeries, 3);
  assert.equal(result.stats.median, 21);
  assert.equal(result.stats.min, 15);
  assert.equal(result.stats.max, 24);
  // the baker is below the middle of it
  assert.ok(result.stats.differenceFromMedianPercent < 0);
  // and every row shown can be checked at its source
  for (const entry of result.comparables) {
    assert.match(entry.product.sourceUrl, /^https:\/\//);
  }
});

// Boulder offered a "Chocolate Chunk Cookie" at 175.00 -- a catering platter
// with no count on it -- as comparable to a 3.50 cookie, and it would have
// been the top of the market.
test("a price eight times the baker's is a platter or a typo, not a comparable", () => {
  const competitors = [
    product("a", "Chocolate Chunk Cookie", 175, null),
    product("a", "Chocolate Chip Cookie", 3.75, 1),
    product("b", "Chocolate Chip Cookie", 3.25, 1),
    product("c", "Chocolate Chip Cookie", 4, 1),
  ];
  const result = compareProduct(
    { name: "Chocolate Chip Cookie", price: 3.5 },
    competitors,
    bakeries,
    "USD",
    silent,
  );
  assert.ok(result.stats, "expected a market from the three sensible prices");
  assert.equal(result.stats.comparableBakeries, 3);
  assert.equal(result.stats.max, 4);
  assert.ok(!result.comparables.some((entry) => entry.product.price === 175));
});

// A sourdough was told "2 bakeries charge 8.10-11.00" and shown, as the one
// example from a shop, its 5.00 listing -- a figure the range had never used.
test("the row shown for a shop is the listing its vote was built from", () => {
  const competitors = [
    product("a", "Sourdough Baguette", 5, 1),
    product("a", "Country French Sourdough", 9, 1),
    product("a", "Fougasse Sourdough", 10, 1),
    product("a", "Honey Whole Wheat Sourdough", 10, 1),
    product("b", "Levain Batard", 8.1, 1),
  ];
  const result = compareProduct(
    { name: "Sourdough Loaf", price: 9 },
    competitors,
    bakeries,
    "USD",
    silent,
  );
  assert.ok(result.stats, "expected a market");
  const shown = oneEachBakery(result.comparables).find((entry) => entry.bakery.id === "a");
  assert.ok(shown, "expected a row for Alpha Bakes");
  // the shop's median sourdough is 9.50; the 5.00 baguette is not the example
  assert.ok(shown.equivalentPrice !== 5, "showed the cheapest listing, not the one the range used");
  assert.ok(Math.abs(shown.equivalentPrice - 9.5) <= 0.5);
});

test("four box sizes from one shop do not become four bakeries", () => {
  const competitors = [
    product("a", "6 Chocolate Chip Cookies", 21, 6),
    product("a", "12 Chocolate Chip Cookies", 42, 12),
    product("a", "18 Chocolate Chip Cookies", 63, 18),
    product("a", "24 Chocolate Chip Cookies", 84, 24),
    product("b", "Half Dozen Chocolate Chip Cookies", 15, 6),
  ];
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    competitors,
    bakeries,
    "USD",
    silent,
  );
  assert.ok(result.stats);
  assert.equal(result.stats.comparableBakeries, 2);
  // Alpha's four listings are all $21 for six, so the market is 15 and 21
  assert.equal(result.stats.min, 15);
  assert.equal(result.stats.max, 21);
});

test("a product with no price never reaches the market", () => {
  const competitors = [
    product("a", "6 Chocolate Chip Cookies", null, 6),
    product("b", "6 Chocolate Chip Cookies", 21, 6),
    product("c", "6 Chocolate Chip Cookies", 24, 6),
  ];
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    competitors,
    bakeries,
    "USD",
    silent,
  );
  assert.ok(result.stats);
  assert.equal(result.stats.comparableBakeries, 2);
});

test("a listing with no quantity is priced as one item", () => {
  const competitors = [
    product("a", "Chocolate Chip Cookie", 3.5, null),
    product("b", "Chocolate Chip Cookie", 4, null),
  ];
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    competitors,
    bakeries,
    "USD",
    silent,
  );
  assert.ok(result.stats);
  // 3.50 each is 21 for six; 4.00 each is 24
  assert.equal(result.stats.min, 21);
  assert.equal(result.stats.max, 24);
});

test("too few bakeries is not a market, and says why", () => {
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    [product("a", "6 Chocolate Chip Cookies", 21, 6)],
    bakeries,
    "USD",
    silent,
  );
  assert.equal(result.stats, null);
  assert.match(result.shortfall || "", /too few/);
});

// Three reasons a market can come back empty, and the baker is told a
// different thing by each: open those shops and look, your bake is unusual,
// or nobody nearby sells it. A count of everything rejected told them none of
// those -- a cafe's coffee beans were in the total.
test("a pool of other bakes says nobody nearby lists this", () => {
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    [product("a", "Sourdough Loaf", 8, 1), product("b", "Butter Croissant", 4, 1)],
    bakeries,
    "USD",
    silent,
  );
  assert.equal(result.stats, null);
  assert.match(result.shortfall || "", /No nearby bakery lists a price for cookie/);
});

test("a near miss says the search worked and the bake is unusual", () => {
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    [product("a", "Assorted Mini Cookies", 12, 6)],
    bakeries,
    "USD",
    silent,
  );
  assert.equal(result.stats, null);
  assert.match(result.shortfall || "", /nothing close enough to compare/);
});

test("a matching bake with no price says to go and look", () => {
  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    [product("a", "6 Chocolate Chip Cookies", null, 6)],
    bakeries,
    "USD",
    silent,
  );
  assert.equal(result.stats, null);
  assert.match(result.shortfall || "", /none of them show a price/);
});

test("a product Baketly cannot categorise is reported, not guessed at", () => {
  const result = compareProduct(
    { name: "Nana's Special", price: 18 },
    [product("a", "6 Chocolate Chip Cookies", 21, 6)],
    bakeries,
    "USD",
    silent,
  );
  assert.equal(result.stats, null);
  assert.match(result.shortfall || "", /could not tell what kind/);
});

test("the same listing read from two pages counts once", () => {
  // Shopify's variant-suffixed name and the collection page's plain one
  const shopify = product("a", "Cookie Tin - 12 Count — Chocolate Chip / 12 COUNT", 48, 12, {
    normalizedName: "cookie tin 12 count chocolate chip 12 count",
    sourceType: "shopify",
    confidence: 0.92,
    sourceUrl: "https://a.example/products/tin",
  });
  const fromPage = product("a", "Cookie Tin - 12 Count", 48, 12, {
    normalizedName: "cookie tin 12 count",
    sourceType: "html",
    confidence: 0.6,
    sourceUrl: "https://a.example/collections/cookies",
  });
  // a genuinely different bake at the same price is not the same listing
  const other = product("a", "Cornflake Marshmallow Cookie Tin", 48, 12, {
    normalizedName: "cornflake marshmallow cookie tin",
    sourceType: "shopify",
    confidence: 0.92,
  });

  const result = compareProduct(
    { name: "Box of 6 Chocolate Chip Cookies", price: 18 },
    [shopify, fromPage, other, product("b", "6 Chocolate Chip Cookies", 21, 6)],
    bakeries,
    "USD",
    silent,
  );
  const alpha = result.comparables.filter((entry) => entry.bakery.id === "a");
  assert.equal(alpha.length, 2, "the duplicate should collapse, the other should stay");
  // and the better-sourced reading is the one kept
  assert.ok(alpha.some((entry) => entry.product.sourceType === "shopify"));
  assert.ok(!alpha.some((entry) => entry.product.sourceType === "html"));
});

test("a bakery with a long menu is named once, not three times", () => {
  const result = compareProduct(
    { name: "Chocolate Chip Cookie", price: 3.5 },
    [
      product("a", "Chocolate Chip Cookie", 4.5, 1),
      product("a", "Double Chocolate Chip Cookie", 4.75, 1),
      product("a", "Chocolate Chip Walnut Cookie", 5, 1),
      product("b", "Chocolate Chip Cookie", 4, 1),
    ],
    bakeries,
    "USD",
    silent,
  );

  const named = oneEachBakery(result.comparables).map((entry: { bakery: { id: string } }) => entry.bakery.id);
  assert.deepEqual([...new Set(named)].sort(), ["a", "b"], "both bakeries appear");
  assert.equal(named.length, new Set(named).size, "no bakery is listed twice");

  // the arithmetic still sees every price that bakery published
  if (result.stats) {
    assert.ok(
      result.stats.comparableProducts >= 4,
      "statistics count every comparable listing, not just the ones shown",
    );
  }
});
