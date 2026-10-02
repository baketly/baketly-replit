import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatesFor, ingredientCandidatesFor } from "./choices";
import type { Workspace } from "./workspace";

function bakery(): Workspace {
  return {
    recipes: [
      { id: "r1", name: "Sourdough Loaf 750g", type: "bread", price: 32, yield: 2 },
      { id: "r2", name: "Country White Loaf", type: "bread", price: 28, yield: 2 },
      { id: "r3", name: "Seeded Rye", type: "bread", price: 34, yield: 1 },
      { id: "r4", name: "Chocolate Chip Cookie", type: "cookie", price: 12, yield: 24 },
      { id: "r5", name: "Oatmeal Raisin Cookie", type: "cookie", price: 11, yield: 24 },
      { id: "r6", name: "Chocolate Babka", type: "babka", price: 45, yield: 2 },
      { id: "r7", name: "Lemon Drizzle Cake", type: "treat", price: 60, yield: 1 },
    ],
    sales: [],
    events: [],
    todoItems: [],
    reminders: null,
    ingredients: {
      flour: { name: "Bread flour", packagePrice: 48, packageSize: 10000, unit: "g" },
      wholemeal: { name: "Wholemeal flour", packagePrice: 39, packageSize: 5000, unit: "g" },
      butter: { name: "Butter", packagePrice: 14, packageSize: 500, unit: "g" },
    },
    packaging: {},
    removedIngredientKeys: [],
    removedPackagingKeys: [],
    recipeGroups: [
      { id: "bread", name: "Bread" },
      { id: "cookie", name: "Cookies" },
      { id: "babka", name: "Babka" },
      { id: "treat", name: "Treats" },
    ],
    hourlyRate: 0,
    currency: "USD",
    bakeryName: "Test",
    bakeryLocation: "Portland",
    marketCheck: null,
  };
}

const names = (list: Array<{ name: string }>) => list.map((entry) => entry.name);

test("a kind of thing offers the recipes of that kind, not the whole book", () => {
  const loaves = names(candidatesFor("loaves", bakery()));
  assert.deepEqual(loaves.sort(), ["Country White Loaf", "Seeded Rye", "Sourdough Loaf 750g"]);

  const cookies = names(candidatesFor("cookies", bakery()));
  assert.deepEqual(cookies.sort(), ["Chocolate Chip Cookie", "Oatmeal Raisin Cookie"]);
});

test("the singular and the group's own name both find their recipes", () => {
  assert.deepEqual(names(candidatesFor("loaf", bakery())).sort(), [
    "Country White Loaf",
    "Seeded Rye",
    "Sourdough Loaf 750g",
  ]);
  assert.deepEqual(names(candidatesFor("bread", bakery())).sort(), [
    "Country White Loaf",
    "Seeded Rye",
    "Sourdough Loaf 750g",
  ]);
  assert.deepEqual(names(candidatesFor("babka", bakery())), ["Chocolate Babka"]);
});

test("a half-named recipe puts the ones that share the words first", () => {
  const found = names(candidatesFor("chocolate", bakery()));
  assert.ok(found.includes("Chocolate Chip Cookie"));
  assert.ok(found.includes("Chocolate Babka"));
  assert.ok(!found.includes("Seeded Rye"));
});

test("a word nothing matches falls back to what they bake most", () => {
  const workspace = bakery();
  workspace.events = [
    {
      id: "e1",
      name: "Market",
      occurredAt: "2026-09-12T12:00:00.000Z",
      plannedItems: [{ productId: "r7", name: "Lemon Drizzle Cake", quantity: 4 }],
      lineItems: [{ productId: "r7", name: "Lemon Drizzle Cake", quantity: 4, unitPrice: 60 }],
    },
  ] as Workspace["events"];
  const found = candidatesFor("whatsits", workspace);
  assert.equal(found.length, 6, "a shortlist, not the whole book");
  assert.equal(found[0].name, "Lemon Drizzle Cake");
  // a guess is not dressed up as a reason
  assert.equal(found[0].detail, "");
});

test("an empty bakery offers nothing to pick from", () => {
  const workspace = bakery();
  workspace.recipes = [];
  assert.deepEqual(candidatesFor("loaves", workspace), []);
});

test("the pantry answers the same way", () => {
  const entries = Object.entries(bakery().ingredients);
  assert.deepEqual(names(ingredientCandidatesFor("flour", entries)).sort(), [
    "Bread flour",
    "Wholemeal flour",
  ]);
  assert.equal(ingredientCandidatesFor("butter", entries)[0].name, "Butter");
});
