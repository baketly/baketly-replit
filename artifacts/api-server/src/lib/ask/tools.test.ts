import assert from "node:assert/strict";
import { test } from "node:test";
import { askLogger } from "./log";
import { runTool } from "./registry";
import { suggestedQuestions } from "./suggestions";
import type { Workspace } from "./workspace";

const silent = askLogger({ info() {}, warn() {} } as never, "user-1", "ask_test");

/** A bakery with two products, two markets and a month of sales. */
function bakery(): Workspace {
  return {
    recipes: [
      {
        id: "cookies",
        name: "Chocolate Chip Cookies",
        type: "cookie",
        price: 18,
        yield: 12,
        activeMinutes: 60,
        ingredientKeys: ["flour"],
        packagingKeys: ["box"],
        amounts: { flour: 600 },
      },
      {
        id: "cupcakes",
        name: "Vanilla Cupcakes",
        type: "cake",
        price: 24,
        yield: 12,
        activeMinutes: 90,
        ingredientKeys: ["flour"],
        packagingKeys: ["box"],
        amounts: { flour: 900 },
      },
    ],
    sales: [
      {
        id: "s1",
        occurredAt: "2026-08-10T10:00:00.000Z",
        eventId: "harbour",
        total: 456.1,
        lineItems: [
          { productId: "cookies", name: "Chocolate Chip Cookies", quantity: 15, unitPrice: 18, unitCost: 3.6 },
          { productId: "cupcakes", name: "Vanilla Cupcakes", quantity: 7, unitPrice: 26.3, unitCost: 5 },
        ],
      },
      {
        id: "s2",
        occurredAt: "2026-08-24T10:00:00.000Z",
        eventId: "school",
        total: 120,
        lineItems: [
          { productId: "cookies", name: "Chocolate Chip Cookies", quantity: 5, unitPrice: 18, unitCost: 3.6 },
          { productId: "cupcakes", name: "Vanilla Cupcakes", quantity: 1, unitPrice: 30, unitCost: 5 },
        ],
      },
      {
        id: "s3",
        occurredAt: "2026-09-05T10:00:00.000Z",
        total: 36,
        lineItems: [
          { productId: "cookies", name: "Chocolate Chip Cookies", quantity: 2, unitPrice: 18, unitCost: 3.6 },
        ],
      },
    ],
    events: [
      {
        id: "harbour",
        name: "Harbour Craft Fair",
        occurredAt: "2026-08-10T09:00:00.000Z",
        boothFee: 60,
        otherCosts: [{ label: "Parking", amount: 12 }],
        status: "completed",
        plannedItems: [{ productId: "cookies", name: "Chocolate Chip Cookies", quantity: 20 }],
        lineItems: [],
      },
      {
        id: "school",
        name: "School Bake Sale",
        occurredAt: "2026-08-24T09:00:00.000Z",
        boothFee: 10,
        status: "completed",
        lineItems: [],
      },
    ],
    ingredients: { flour: { name: "Flour", packagePrice: 10, packageSize: 1000, unit: "g" } },
    packaging: { box: { name: "Box", packPrice: 20, unitsPerPack: 100 } },
    removedIngredientKeys: [],
    removedPackagingKeys: [],
    recipeGroups: [
      { id: "cookie", name: "Cookies" },
      { id: "cake", name: "Cakes" },
    ],
    hourlyRate: 30,
    currency: "USD",
    bakeryName: "Test Bakes",
    bakeryLocation: "West Orange, New Jersey",
    marketCheck: {
      checkedAt: "2026-09-18T10:00:00.000Z",
      currency: "USD",
      products: [
        {
          name: "Chocolate Chip Cookies",
          price: 18,
          unitPrice: 1.5,
          quantity: 12,
          provenance: "verified",
          median: 23,
          average: 22.4,
          p25: 20,
          p75: 26,
          localLow: 15,
          localHigh: 30,
          differenceFromMedianPercent: -21.7,
          userPercentile: 20,
          comparableBakeries: 11,
          comparableProducts: 26,
          suggested: { competitive: 20, market: 23, premium: 26 },
        },
        {
          name: "Vanilla Cupcakes",
          price: 24,
          provenance: "ai_search",
          median: null,
          differenceFromMedianPercent: null,
          comparableBakeries: 0,
        },
      ],
    },
  };
}

const call = (name: string, args: Record<string, unknown> = {}) =>
  runTool(bakery(), name, args, silent).result as Record<string, never>;

test("1. which product is most profitable, and 2. best margin", () => {
  const result = call("compareProducts") as Record<string, unknown>;
  // cookies: 22 sold at $14.40 profit each; cupcakes: 8 at a lower margin
  assert.equal(result.mostTotalProfit, "Chocolate Chip Cookies");
  assert.equal(result.bestMargin, "Chocolate Chip Cookies");
  const products = result.products as Array<Record<string, number | string>>;
  assert.equal(products.length, 2);
  assert.equal(products[0].totalProfit, 325.6);
});

test("3. compare my last two events, with no names given", () => {
  const result = call("compareEvents") as Record<string, unknown>;
  const events = result.events as Array<Record<string, unknown>>;
  assert.equal(events.length, 2);
  const comparison = result.comparison as Record<string, unknown>;
  assert.equal(comparison.betterProfitEvent, "Harbour Craft Fair");
  assert.ok((comparison.profitDifference as number) > 0);
});

test("4. was Harbour better than School, named", () => {
  const result = call("compareEvents", {
    events: ["Harbour Craft Fair", "School Bake Sale"],
  }) as Record<string, unknown>;
  const events = result.events as Array<Record<string, unknown>>;
  assert.deepEqual(
    events.map((event) => event.name),
    ["Harbour Craft Fair", "School Bake Sale"],
  );
  const harbour = events[0];
  assert.equal(harbour.revenue, 456.1);
  assert.equal(harbour.boothFee, 60);
  assert.equal(harbour.otherCosts, 12);
  // revenue 456.10 less 89 of costs
  assert.equal(harbour.totalCost, 161);
  assert.equal(harbour.profit, 295.1);
  assert.equal(harbour.roiPercent, 183);
});

test("7. which products to bring more of, from what sold and what came home", () => {
  const result = call("getEventDetails", { event: "Harbour" }) as Record<string, unknown>;
  const products = result.products as Array<Record<string, unknown>>;
  assert.equal(products[0].name, "Chocolate Chip Cookies");
  assert.equal(products[0].units, 15);
  // twenty planned, fifteen sold
  assert.deepEqual(result.unsold, [
    { name: "Chocolate Chip Cookies", planned: 20, sold: 15, left: 5 },
  ]);
});

test("8 and 9. this month, and what changed against last month", () => {
  const summary = runTool(bakery(), "getBakerySummary", { period: "all_time" }, silent)
    .result as Record<string, unknown>;
  assert.equal(summary.revenue, 612.1);
  assert.equal(summary.orders, 3);
  assert.ok((summary.averageOrderValue as number) > 0);

  const trends = runTool(bakery(), "getSalesTrends", { period: "last_month" }, silent)
    .result as Record<string, unknown>;
  const period = trends.period as Record<string, unknown>;
  // the period is stated, so the answer can name it
  assert.match(String(period.label), /\w+ \d{4}/);
  assert.ok(Object.prototype.hasOwnProperty.call(trends, "revenueChangePercent"));
});

test("10 and 12. local prices come from the verified check only", () => {
  const cookies = call("getMarketPricing", { product: "cookies" }) as Record<string, unknown>;
  assert.equal(cookies.marketMedian, 23);
  assert.equal(cookies.comparableBakeryCount, 11);
  assert.equal(cookies.percentFromMedian, -21.7);
  assert.equal(cookies.confidence, "verified");
  // the baker's own cost comes with it, so advice can weigh a rise
  assert.equal(cookies.costPerUnit, 3.2);

  // a product whose numbers came from a web search is not local market data
  const cupcakes = call("getMarketPricing", { product: "Vanilla Cupcakes" }) as Record<string, unknown>;
  assert.equal(cupcakes.available, false);

  const all = call("getMarketPricing") as Record<string, unknown>;
  const products = all.products as Array<Record<string, unknown>>;
  assert.equal(products.length, 1, "only verified products are ranked");
});

test("11. what happens if I raise the price", () => {
  const result = call("analyzeProductPrice", {
    product: "Chocolate Chip Cookies",
    proposedPrice: 20,
  }) as Record<string, unknown>;
  const current = result.current as Record<string, number>;
  assert.equal(current.price, 18);
  assert.equal(current.costPerUnit, 3.2);
  assert.equal(current.profitPerUnit, 14.8);
  const scenarios = result.scenarios as Array<Record<string, number>>;
  const twenty = scenarios.find((scenario) => scenario.price === 20);
  assert.equal(twenty?.profitPerUnit, 16.8);
  assert.equal(twenty?.marginPercent, 84);
  // and the assumption behind the extra profit is stated, not hidden
  assert.match(String(result.note), /assumption/);
});

test("a question about a product that does not exist is answered, not invented", () => {
  const result = call("getProductDetails", { product: "sourdough" }) as Record<string, unknown>;
  assert.equal(result.available, false);
  assert.ok(Array.isArray(result.productsOnRecord));
});

test("an ambiguous market asks which one, rather than picking", () => {
  const workspace = bakery();
  workspace.events.push({
    id: "harbour-2",
    name: "Harbour Craft Fair Winter",
    occurredAt: "2026-12-10T09:00:00.000Z",
    boothFee: 60,
    lineItems: [],
  });
  const result = runTool(workspace, "getEventDetails", { event: "Craft Fair" }, silent).result as Record<
    string,
    unknown
  >;
  assert.equal(result.available, false);
  assert.equal((result.candidates as unknown[]).length, 2);
});

test("a tool that does not exist is refused without throwing", () => {
  const result = runTool(bakery(), "deleteEverything", {}, silent).result as Record<string, unknown>;
  assert.match(String(result.error), /no tool called/);
});

test("every answer carries what it was drawn from", () => {
  const outcome = runTool(bakery(), "compareEvents", {}, silent);
  assert.equal(outcome.sources[0].kind, "events");
  const market = runTool(bakery(), "getMarketPricing", { product: "cookies" }, silent);
  assert.equal(market.sources[0].kind, "market");
  assert.match(market.sources[0].detail, /11 nearby bakeries/);
});

test("suggested questions follow what the baker actually has", () => {
  const suggestions = suggestedQuestions(bakery());
  assert.ok(suggestions.length > 0 && suggestions.length <= 4);
  // a product 21% below the local median is the most useful thing to offer
  assert.match(suggestions[0], /charging enough/);

  const empty = suggestedQuestions({ ...bakery(), recipes: [], sales: [], events: [] });
  assert.match(empty[0], /What can Baketly do/);
});
