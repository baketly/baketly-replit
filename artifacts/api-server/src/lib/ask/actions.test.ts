import assert from "node:assert/strict";
import { test } from "node:test";
import { isAction, resolveDay, runAction } from "./actions";
import type { Workspace } from "./workspace";

const TODAY = "2026-10-02"; // a Friday

function bakery(): Workspace {
  return {
    recipes: [
      { id: "r1", name: "Sourdough Loaf 750g", price: 32, yield: 2 },
      { id: "r2", name: "Sourdough Cheddar Loaf", price: 36, yield: 2 },
      { id: "r3", name: "Chocolate Chip Cookie", price: 12, yield: 24 },
    ],
    sales: [],
    events: [],
    todoItems: [],
    reminders: null,
    ingredients: {
      flour: { name: "Bread flour", packagePrice: 48, packageSize: 10000, unit: "g" },
      butter: { name: "Butter", packagePrice: 14, packageSize: 500, unit: "g" },
    },
    packaging: {},
    removedIngredientKeys: [],
    removedPackagingKeys: [],
    recipeGroups: [],
    hourlyRate: 0,
    currency: "ILS",
    bakeryName: "Test",
    bakeryLocation: "Tel Aviv",
    marketCheck: null,
  };
}

test("days are read from what the baker said, held to a sensible window", () => {
  assert.deepEqual(resolveDay(undefined, TODAY), { day: TODAY });
  assert.deepEqual(resolveDay("tomorrow", TODAY), { day: "2026-10-03" });
  assert.deepEqual(resolveDay("friday", TODAY), { day: TODAY });
  assert.deepEqual(resolveDay("next friday", TODAY), { day: "2026-10-09" });
  assert.deepEqual(resolveDay("Monday", TODAY), { day: "2026-10-05" });
  assert.deepEqual(resolveDay("2026-10-15", TODAY), { day: "2026-10-15" });
  assert.ok("error" in resolveDay("2026-02-30", TODAY));
  assert.ok("error" in resolveDay("2028-01-01", TODAY));
  assert.ok("error" in resolveDay("whenever", TODAY));
});

test("a to-do is prepared for its day, never added", () => {
  const out = runAction(bakery(), "addTodo", { text: "Buy eggs", date: "tomorrow" }, TODAY);
  assert.ok(out.proposal, "expected a proposal");
  assert.deepEqual(out.proposal.action, { type: "addTodo", text: "Buy eggs", day: "2026-10-03" });
  assert.match(out.proposal.summary, /tomorrow/);
  // and the model is told in so many words that nothing has happened yet
  assert.equal(out.result.prepared, true);
  assert.match(String(out.result.note), /not done/);
});

test("a market with six sourdough loaves names the recipe it matched", () => {
  const out = runAction(
    bakery(),
    "createEvent",
    { name: "Farmers market", date: "2026-10-03", boothFee: 120, items: [{ product: "sourdough loaf", quantity: 6 }] },
    TODAY,
  );
  assert.ok(out.proposal);
  const action = out.proposal.action;
  assert.equal(action.type, "createEvent");
  if (action.type !== "createEvent") return;
  assert.equal(action.day, "2026-10-03");
  assert.equal(action.boothFee, 120);
  assert.deepEqual(action.items, [{ productId: "r1", name: "Sourdough Loaf 750g", quantity: 6 }]);
  assert.match(out.proposal.summary, /6 × Sourdough Loaf 750g/);
  assert.match(out.proposal.summary, /₪120/);
});

test("a name that fits two recipes is a question, not a guess", () => {
  const out = runAction(bakery(), "createEvent", { items: [{ product: "sourdough", quantity: 6 }] }, TODAY);
  assert.equal(out.proposal, null);
  assert.deepEqual(out.result.ambiguous, [
    { said: "sourdough", matches: ["Sourdough Loaf 750g", "Sourdough Cheddar Loaf"] },
  ]);
});

test("a recipe nobody has is refused with the list they do have", () => {
  const out = runAction(bakery(), "setProductPrice", { product: "Baguette", price: 10 }, TODAY);
  assert.equal(out.proposal, null);
  assert.deepEqual(out.result.theirRecipes, ["Sourdough Loaf 750g", "Sourdough Cheddar Loaf", "Chocolate Chip Cookie"]);
});

test("a price change says what it is from and to", () => {
  const out = runAction(bakery(), "setProductPrice", { product: "chocolate chip cookie", price: 14 }, TODAY);
  assert.ok(out.proposal);
  assert.deepEqual(out.proposal.action, { type: "setProductPrice", productId: "r3", name: "Chocolate Chip Cookie", from: 12, to: 14 });
  assert.equal(out.proposal.summary, "Change Chocolate Chip Cookie from ₪12 to ₪14");
  // the same price again is not a change
  assert.equal(runAction(bakery(), "setProductPrice", { product: "chocolate chip cookie", price: 12 }, TODAY).proposal, null);
});

test("an ingredient's package price is matched by name and keeps its key", () => {
  const out = runAction(bakery(), "setIngredientPrice", { ingredient: "flour", packagePrice: 52 }, TODAY);
  assert.ok(out.proposal);
  assert.deepEqual(out.proposal.action, {
    type: "setIngredientPrice",
    key: "flour",
    name: "Bread flour",
    from: 48,
    to: 52,
    packageSize: null,
    unit: "g",
  });
  assert.match(out.proposal.summary, /10000 g/);
});

test("only the four are actions", () => {
  assert.ok(isAction("addTodo") && isAction("createEvent") && isAction("setProductPrice") && isAction("setIngredientPrice"));
  assert.ok(!isAction("getPantry"));
  assert.equal(runAction(bakery(), "deleteEverything", {}, TODAY).proposal, null);
});
