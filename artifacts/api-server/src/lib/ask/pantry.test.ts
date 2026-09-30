import assert from "node:assert/strict";
import { test } from "node:test";
import { getNextStep, getPantry } from "./pantry";
import type { Workspace } from "./workspace";

function bakery(overrides: Partial<Workspace> = {}): Workspace {
  return {
    recipes: [],
    sales: [],
    events: [],
    todoItems: [],
    reminders: null,
    ingredients: {},
    packaging: {},
    removedIngredientKeys: [],
    removedPackagingKeys: [],
    recipeGroups: [],
    hourlyRate: 0,
    currency: "USD",
    bakeryName: "Test Bakes",
    bakeryLocation: "",
    marketCheck: null,
    ...overrides,
  };
}

const flour = { name: "Bread flour", supplier: "Costco", packagePrice: 12, packageSize: 12000, unit: "g" };
const vanilla = { name: "Vanilla paste", supplier: "Deli", packagePrice: 40, packageSize: 100, unit: "ml" };

const loaf = {
  id: "loaf",
  name: "Sourdough",
  price: 9,
  yield: 4,
  ingredientKeys: ["flour", "vanilla"],
  packagingKeys: [],
  amounts: { flour: 2000, vanilla: 1 },
} as never;

const step = (workspace: Workspace) =>
  (getNextStep(workspace).result as { step: string }).step;

// ---- the ladder ---------------------------------------------------------

test("an empty bakery is asked for its pantry first", () => {
  assert.equal(step(bakery()), "add_ingredients");
});

test("ingredients with nothing made from them asks for a recipe", () => {
  assert.equal(step(bakery({ ingredients: { flour } })), "add_recipe");
});

test("a recipe with no ingredient prices behind it asks for the pantry", () => {
  assert.equal(step(bakery({ recipes: [loaf] })), "add_ingredients");
});

test("a recipe with no price asks for one", () => {
  const unpriced = { ...(loaf as object), price: 0 } as never;
  assert.equal(step(bakery({ ingredients: { flour }, recipes: [unpriced] })), "price_recipes");
});

test("costs and prices in, nothing sold, asks for a sale", () => {
  assert.equal(step(bakery({ ingredients: { flour }, recipes: [loaf] })), "record_sales");
});

test("a handful of sales asks for more before calling anything a pattern", () => {
  const sales = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}` })) as never[];
  assert.equal(step(bakery({ ingredients: { flour }, recipes: [loaf], sales })), "more_sales");
});

test("with trading behind it, the missing hourly rate is the next thing", () => {
  const sales = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })) as never[];
  assert.equal(step(bakery({ ingredients: { flour }, recipes: [loaf], sales })), "set_hourly_rate");
});

test("a rate with no batch times is not a rate that counts", () => {
  const sales = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })) as never[];
  const workspace = bakery({ ingredients: { flour }, recipes: [loaf], sales, hourlyRate: 15 });
  assert.equal(step(workspace), "add_batch_times");
  assert.equal(
    (getNextStep(workspace).result as { recipesMissingBatchTime: number }).recipesMissingBatchTime,
    1,
  );
});

test("then a market, then a price check, then nothing pressing", () => {
  const sales = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })) as never[];
  const timed = { ...(loaf as object), activeMinutes: 40 } as never;
  const base = bakery({ ingredients: { flour }, recipes: [timed], sales, hourlyRate: 15 });
  assert.equal(step(base), "plan_market");

  const withMarket = { ...base, events: [{ id: "e1" }] as never[] };
  assert.equal(step(withMarket), "run_price_check");

  const withCheck = { ...withMarket, marketCheck: { ran: true } };
  assert.equal(step(withCheck), "nothing_pressing");
});

test("every rung says why, so an answer never has to invent a reason", () => {
  for (const workspace of [bakery(), bakery({ ingredients: { flour } }), bakery({ recipes: [loaf] })]) {
    const why = (getNextStep(workspace).result as { why: string }).why;
    assert.ok(why.length > 20, why);
  }
});

// ---- the pantry ---------------------------------------------------------

test("an empty pantry says so rather than returning nothing", () => {
  const out = getPantry(bakery()).result as { available: boolean };
  assert.equal(out.available, false);
});

test("ingredients are ranked by what they cost across the bakes that use them", () => {
  const out = getPantry(
    bakery({ ingredients: { flour, vanilla }, recipes: [loaf] }),
  ).result as {
    ingredientCount: number;
    dearestAcrossProducts: { name: string };
    ingredients: Array<{ name: string; usedInProducts: number; costAcrossProducts: number }>;
  };

  assert.equal(out.ingredientCount, 2);
  // 2000g of flour at $0.001/g over 4 loaves is $0.50 a loaf; one ml of
  // vanilla at $0.40/ml over 4 is $0.10 — the dear jar is the smaller problem
  assert.equal(out.dearestAcrossProducts.name, "Bread flour");
  assert.equal(out.ingredients[0].costAcrossProducts, 0.5);
  assert.equal(out.ingredients[1].costAcrossProducts, 0.1);
  assert.equal(out.ingredients[0].usedInProducts, 1);
});

test("an ingredient nothing uses is named as such", () => {
  const out = getPantry(
    bakery({ ingredients: { flour, vanilla }, recipes: [] }),
  ).result as { unusedCount: number; unused: string[] };
  assert.equal(out.unusedCount, 2);
  assert.ok(out.unused.includes("Bread flour"));
});
