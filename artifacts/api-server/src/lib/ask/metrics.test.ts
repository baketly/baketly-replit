import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventRollup,
  findEvents,
  findRecipes,
  productProfit,
  productSales,
  recipeCost,
  salesBetween,
  totalsOf,
} from "./metrics";
import { monthPeriod, previousPeriod, resolvePeriod } from "./periods";
import type { Workspace } from "./workspace";

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    recipes: [],
    sales: [],
    events: [],
    ingredients: {},
    packaging: {},
    removedIngredientKeys: [],
    removedPackagingKeys: [],
    recipeGroups: [{ id: "cookie", name: "Cookies" }],
    hourlyRate: 0,
    currency: "USD",
    bakeryName: "Test Bakes",
    bakeryLocation: "West Orange, New Jersey",
    marketCheck: null,
    ...overrides,
  };
}

const cookieShop = workspace({
  hourlyRate: 30,
  ingredients: {
    flour: { name: "Flour", packagePrice: 10, packageSize: 1000, unit: "g" },
    chocolate: { name: "Chocolate", packagePrice: 12, packageSize: 500, unit: "g" },
  },
  packaging: { box: { name: "Box", packPrice: 20, unitsPerPack: 100 } },
  recipes: [
    {
      id: "cookie",
      name: "Chocolate Chip Cookies",
      type: "cookie",
      price: 18,
      yield: 12,
      activeMinutes: 60,
      ingredientKeys: ["flour", "chocolate"],
      packagingKeys: ["box"],
      amounts: { flour: 600, chocolate: 200 },
    },
  ],
});

test("a unit cost is ingredients, packaging and time", () => {
  const cost = recipeCost(cookieShop.recipes[0], cookieShop);
  // 600g flour at $0.01 = $6, 200g chocolate at $0.024 = $4.80, over 12 units
  assert.equal(cost.ingredientCost, 0.9);
  assert.equal(cost.packagingCost, 0.2);
  // an hour at $30 over 12 units
  assert.equal(cost.labourCost, 2.5);
  assert.equal(cost.unitCost, 3.6);
  assert.equal(cost.labourCosted, true);
});

test("without an hourly rate, time is not costed and it says so", () => {
  const unpaid = { ...cookieShop, hourlyRate: 0 };
  const cost = recipeCost(unpaid.recipes[0], unpaid);
  assert.equal(cost.labourCost, 0);
  assert.equal(cost.labourCosted, false);
  assert.equal(cost.unitCost, 1.1);
});

test("profit per unit and margin come from that cost", () => {
  const profit = productProfit(cookieShop.recipes[0], cookieShop);
  assert.equal(profit.sellingPrice, 18);
  assert.equal(profit.profitPerUnit, 14.4);
  assert.equal(profit.marginPercent, 80);
  assert.equal(profit.group, "Cookies");
});

const sales = [
  {
    id: "s1",
    occurredAt: "2026-08-03T10:00:00.000Z",
    total: 36,
    lineItems: [{ productId: "cookie", name: "Cookies", quantity: 2, unitPrice: 18, unitCost: 3.6 }],
  },
  {
    id: "s2",
    occurredAt: "2026-08-20T10:00:00.000Z",
    eventId: "ev1",
    total: 54,
    lineItems: [
      { productId: "cookie", name: "Cookies", quantity: 2, unitPrice: 18, unitCost: 3.6 },
      { productId: "loaf", name: "Sourdough", quantity: 2, unitPrice: 9, unitCost: 3 },
    ],
  },
  {
    id: "s3",
    occurredAt: "2026-09-02T10:00:00.000Z",
    total: 18,
    lineItems: [{ productId: "cookie", name: "Cookies", quantity: 1, unitPrice: 18, unitCost: 3.6 }],
  },
];

test("sales are counted only inside the period asked for", () => {
  const august = salesBetween(sales, "2026-08-01", "2026-08-31");
  assert.equal(august.length, 2);
  const totals = totalsOf(august);
  assert.equal(totals.revenue, 90);
  assert.equal(totals.units, 6);
  assert.equal(totals.orders, 2);
  assert.equal(totals.productionCost, 20.4);
});

test("a product's revenue, profit and margin are its own", () => {
  const rows = productSales(salesBetween(sales, "2026-08-01", "2026-08-31"));
  assert.equal(rows[0].name, "Cookies");
  assert.equal(rows[0].units, 4);
  assert.equal(rows[0].revenue, 72);
  assert.equal(rows[0].profit, 57.6);
  assert.equal(rows[0].marginPercent, 80);
  assert.equal(rows[1].name, "Sourdough");
  assert.equal(rows[1].revenue, 18);
});

test("a market's profit counts its booth fee and its other costs", () => {
  const shop = { ...cookieShop, sales };
  const rollup = eventRollup(
    {
      id: "ev1",
      name: "Harbour Craft Fair",
      occurredAt: "2026-08-20T09:00:00.000Z",
      boothFee: 25,
      otherCosts: [{ label: "Parking", amount: 10 }],
      status: "completed",
      plannedItems: [{ productId: "cookie", name: "Cookies", quantity: 6 }],
      lineItems: [],
    },
    shop,
  );
  assert.equal(rollup.revenue, 54);
  assert.equal(rollup.productionCost, 13.2);
  assert.equal(rollup.totalCost, 48.2);
  assert.equal(rollup.profit, 5.8);
  assert.equal(rollup.roiPercent, 12);
  assert.equal(rollup.unitsSold, 4);
  // two of the six planned cookies came home
  assert.deepEqual(rollup.unsold, [{ name: "Cookies", planned: 6, sold: 2, left: 4 }]);
});

test("a market with no sales is not a division by zero", () => {
  const rollup = eventRollup(
    { id: "ev9", name: "Quiet Fair", occurredAt: "2026-08-01T09:00:00.000Z", boothFee: 0, lineItems: [] },
    cookieShop,
  );
  assert.equal(rollup.revenue, 0);
  assert.equal(rollup.roiPercent, null);
  assert.equal(rollup.marginPercent, 0);
});

test("products and markets are found the way a baker names them", () => {
  const shop = {
    ...cookieShop,
    events: [
      { id: "ev1", name: "Harbour Craft Fair", occurredAt: "2026-08-20T09:00:00.000Z", boothFee: 25, lineItems: [] },
      { id: "ev2", name: "School Bake Sale", occurredAt: "2026-07-20T09:00:00.000Z", boothFee: 0, lineItems: [] },
    ],
  };
  assert.equal(findEvents(shop, "harbour craft fair")[0].id, "ev1");
  assert.equal(findEvents(shop, "harbour")[0].id, "ev1");
  assert.equal(findEvents(shop, "bake sale")[0].id, "ev2");
  assert.equal(findEvents(shop, "nothing like this").length, 0);
  assert.equal(findRecipes(shop, "chocolate chip cookies")[0].id, "cookie");
  assert.equal(findRecipes(shop, "cookies")[0].id, "cookie");
});

test("periods resolve to real dates", () => {
  const now = new Date(2026, 8, 21); // 21 September 2026, a Monday
  assert.deepEqual(
    { ...resolvePeriod("last_month", now) },
    { name: "last_month", from: "2026-08-01", to: "2026-08-31", label: "August 2026" },
  );
  assert.equal(resolvePeriod("this_month", now).from, "2026-09-01");
  assert.equal(resolvePeriod("today", now).from, "2026-09-21");
  assert.equal(resolvePeriod("this_week", now).from, "2026-09-21");
  assert.equal(resolvePeriod("last_week", now).from, "2026-09-14");
  assert.equal(resolvePeriod("last_week", now).to, "2026-09-20");
  assert.equal(resolvePeriod("last_30_days", now).from, "2026-08-23");
  assert.equal(resolvePeriod("this_year", now).from, "2026-01-01");
  assert.equal(monthPeriod("2026-08")?.label, "August 2026");
});

test("the period before this one is the same length", () => {
  const now = new Date(2026, 8, 21);
  assert.equal(previousPeriod(resolvePeriod("this_month", now), now).name, "last_month");
  const thirty = previousPeriod(resolvePeriod("last_30_days", now), now);
  assert.equal(thirty.from, "2026-07-24");
  assert.equal(thirty.to, "2026-08-22");
});
