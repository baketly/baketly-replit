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
  assert.equal(out.proposal.choices, undefined, "nothing to ask");
  // the lineup is listed by the card, line by line, not folded into the summary
  assert.match(out.proposal.summary, /Farmers market/);
  assert.match(out.proposal.summary, /₪120/);
});

test("a name that fits two recipes is asked on the card, not guessed at", () => {
  const out = runAction(bakery(), "createEvent", { items: [{ product: "sourdough", quantity: 6 }] }, TODAY);
  assert.ok(out.proposal);
  const action = out.proposal.action;
  if (action.type !== "createEvent") throw new Error("wrong action");
  // the line keeps its place and its quantity, with their words standing in
  assert.deepEqual(action.items, [{ productId: "", name: "sourdough", quantity: 6 }]);
  const choices = out.proposal.choices || [];
  assert.equal(choices.length, 1);
  assert.equal(choices[0].slot, "item:0");
  assert.equal(choices[0].said, "sourdough");
  assert.deepEqual(choices[0].options.map((option) => option.name), [
    "Sourdough Loaf 750g",
    "Sourdough Cheddar Loaf",
  ]);
  // and the model is told to leave the asking to the card
  assert.match(String(out.result.askingNote), /do not list their recipes/);
});

test("a kind of thing they do not have a recipe for is asked with the likely ones", () => {
  const out = runAction(bakery(), "createEvent", { items: [{ product: "loaves", quantity: 6 }, { product: "cookies", quantity: 15 }] }, TODAY);
  assert.ok(out.proposal);
  const choices = out.proposal.choices || [];
  assert.deepEqual(choices.map((choice) => choice.slot), ["item:0", "item:1"]);
  assert.deepEqual(choices[0].options.map((option) => option.name), [
    "Sourdough Loaf 750g",
    "Sourdough Cheddar Loaf",
  ]);
  assert.deepEqual(choices[1].options.map((option) => option.name), ["Chocolate Chip Cookie"]);
});

test("a recipe nobody has is asked about, with what they do have to tap", () => {
  const out = runAction(bakery(), "setProductPrice", { product: "Baguette", price: 10 }, TODAY);
  assert.ok(out.proposal);
  const choices = out.proposal.choices || [];
  assert.equal(choices.length, 1);
  assert.equal(choices[0].slot, "product");
  // a baguette is a loaf, so the loaves are offered and the cookie is not
  assert.deepEqual(choices[0].options.map((option) => option.name), [
    "Sourdough Loaf 750g",
    "Sourdough Cheddar Loaf",
  ]);
  // the price is theirs; only which recipe is still open
  if (out.proposal.action.type !== "setProductPrice") throw new Error("wrong action");
  assert.equal(out.proposal.action.to, 10);
  assert.equal(out.proposal.action.productId, "");
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

test("a follow-up about the market on the card changes that card, keeping what was picked", () => {
  // the first ask left one line still being asked about and one resolved
  const first = runAction(
    bakery(),
    "createEvent",
    { date: "2026-10-10", items: [{ product: "sourdough", quantity: 20 }, { product: "chocolate chip cookie", quantity: 25 }] },
    TODAY,
  );
  assert.ok(first.proposal);
  assert.equal((first.proposal.choices || []).length, 1);
  // the baker picks the loaf on the card; the app sends the card back as it now is
  const onScreen = structuredClone(first.proposal);
  if (onScreen.action.type !== "createEvent") throw new Error("wrong action");
  onScreen.action.items[0] = { productId: "r1", name: "Sourdough Loaf 750g", quantity: 20 };
  onScreen.choices = [];

  const second = runAction(
    bakery(),
    "createEvent",
    { amends: first.proposal.id, name: "Base market", boothFee: 50 },
    TODAY,
    [onScreen],
  );
  assert.ok(second.proposal);
  // the same card, not a second one
  assert.equal(second.proposal.id, first.proposal.id);
  assert.equal(second.result.amended, true);
  const action = second.proposal.action;
  if (action.type !== "createEvent") throw new Error("wrong action");
  assert.equal(action.name, "Base market");
  assert.equal(action.boothFee, 50);
  assert.equal(action.day, "2026-10-10", "the day they gave the first time stands");
  // nothing is asked again
  assert.deepEqual(action.items, [
    { productId: "r1", name: "Sourdough Loaf 750g", quantity: 20 },
    { productId: "r3", name: "Chocolate Chip Cookie", quantity: 25 },
  ]);
  assert.equal(second.proposal.choices, undefined);
  assert.match(second.proposal.summary, /Base market/);
  assert.match(second.proposal.summary, /₪50/);
});

test("amending with a line already there corrects its quantity; a new line joins", () => {
  const first = runAction(bakery(), "createEvent", { items: [{ product: "chocolate chip cookie", quantity: 25 }] }, TODAY);
  assert.ok(first.proposal);
  const second = runAction(
    bakery(),
    "createEvent",
    { amends: first.proposal.id, items: [{ product: "chocolate chip cookie", quantity: 30 }, { product: "cheddar loaf", quantity: 4 }] },
    TODAY,
    [first.proposal],
  );
  assert.ok(second.proposal);
  if (second.proposal.action.type !== "createEvent") throw new Error("wrong action");
  assert.deepEqual(second.proposal.action.items, [
    { productId: "r3", name: "Chocolate Chip Cookie", quantity: 30 },
    { productId: "r2", name: "Sourdough Cheddar Loaf", quantity: 4 },
  ]);
});

function withMarkets(): Workspace {
  const workspace = bakery();
  workspace.events = [
    { id: "e1", name: "Base market", occurredAt: "2026-10-10T12:00:00.000Z", boothFee: 40, status: "planned", plannedItems: [{ productId: "r1", name: "Sourdough Loaf 750g", quantity: 20 }], lineItems: [] },
    { id: "e2", name: "Riverside night market", occurredAt: "2026-10-17T12:00:00.000Z", boothFee: 60, status: "planned", plannedItems: [], lineItems: [] },
    { id: "e3", name: "Summer fair", occurredAt: "2026-08-02T12:00:00.000Z", boothFee: 30, status: "completed", plannedItems: [], lineItems: [] },
  ];
  return workspace;
}

test("a change to a saved market names it when the words fit one", () => {
  const out = runAction(withMarkets(), "updateEvent", { market: "base market", boothFee: 50 }, TODAY);
  assert.ok(out.proposal);
  assert.equal(out.proposal.choices, undefined);
  const action = out.proposal.action;
  if (action.type !== "updateEvent") throw new Error("wrong action");
  assert.equal(action.eventId, "e1");
  assert.equal(action.boothFee, 50);
  assert.equal(action.what, "booth fee ₪50");
  assert.equal(out.proposal.summary, "Change Base market: booth fee ₪50");
});

test("a change to a market not named plainly asks which, offering the ones to come", () => {
  const out = runAction(withMarkets(), "updateEvent", { market: "the market", name: "Autumn market" }, TODAY);
  assert.ok(out.proposal);
  const choices = out.proposal.choices || [];
  assert.equal(choices.length, 1);
  assert.equal(choices[0].slot, "event");
  // soonest first; the fair that already happened is not offered
  assert.deepEqual(choices[0].options.map((option) => option.name), ["Base market", "Riverside night market"]);
  assert.match(choices[0].options[0].detail, /October/);
  if (out.proposal.action.type !== "updateEvent") throw new Error("wrong action");
  assert.equal(out.proposal.action.eventId, "");
  assert.equal(out.proposal.action.name, "Autumn market");
});

test("a change with nothing to change in it is refused", () => {
  const out = runAction(withMarkets(), "updateEvent", { market: "base market" }, TODAY);
  assert.equal(out.proposal, null);
  assert.match(String(out.result.problem), /Nothing to change/);
});

test("a 'new' market that names one they have is a change to that one", () => {
  // what the model did: createEvent for the base market with a fee
  const out = runAction(withMarkets(), "createEvent", { name: "base market", boothFee: 50 }, TODAY);
  assert.ok(out.proposal);
  const action = out.proposal.action;
  if (action.type !== "updateEvent") throw new Error("expected a change to the saved market, got " + action.type);
  assert.equal(action.eventId, "e1");
  assert.equal(action.eventName, "Base market");
  assert.equal(action.boothFee, 50);
  assert.equal(out.proposal.choices, undefined, "one market named plainly is not asked about");
  assert.match(String(out.result.note), /already have this market/);
});

test("a 'new' market that looks like a saved one but on another day asks: that one, or a new one?", () => {
  const out = runAction(withMarkets(), "createEvent", { name: "base market", date: "2026-10-24", boothFee: 50 }, TODAY);
  assert.ok(out.proposal);
  const choices = out.proposal.choices || [];
  assert.equal(choices.length, 1);
  assert.equal(choices[0].slot, "event");
  assert.deepEqual(choices[0].options.map((option) => option.name), ["Base market", "A new market"]);
  const action = out.proposal.action;
  if (action.type !== "updateEvent") throw new Error("wrong action");
  // what a new market would be, kept for the "new market" button
  assert.deepEqual(action.asNew, { name: "base market", day: "2026-10-24", boothFee: 50, otherCosts: [] });
});

test("a market on a day that already has one, with no name said, asks too", () => {
  const out = runAction(withMarkets(), "createEvent", { date: "2026-10-10", items: [{ product: "chocolate chip cookie", quantity: 12 }] }, TODAY);
  assert.ok(out.proposal);
  const choices = out.proposal.choices || [];
  assert.equal(choices[0].slot, "event");
  assert.deepEqual(choices[0].options.map((option) => option.name), ["Base market", "A new market"]);
});

test("a genuinely new market on a free day is set up, costs and all", () => {
  const out = runAction(
    withMarkets(),
    "createEvent",
    { name: "Harvest fair", date: "2026-11-07", boothFee: 80, otherCosts: [{ label: "parking", amount: 20 }, { label: "helper", amount: 60 }] },
    TODAY,
  );
  assert.ok(out.proposal);
  const action = out.proposal.action;
  if (action.type !== "createEvent") throw new Error("wrong action");
  assert.deepEqual(action.otherCosts, [{ label: "parking", amount: 20 }, { label: "helper", amount: 60 }]);
  assert.match(out.proposal.summary, /parking ₪20, helper ₪60/);
});

test("costs beyond the booth fee can be added to a saved market", () => {
  const out = runAction(withMarkets(), "updateEvent", { market: "riverside", otherCosts: [{ label: "petrol", amount: 35 }] }, TODAY);
  assert.ok(out.proposal);
  const action = out.proposal.action;
  if (action.type !== "updateEvent") throw new Error("wrong action");
  assert.equal(action.eventId, "e2");
  assert.deepEqual(action.otherCosts, [{ label: "petrol", amount: 35 }]);
  assert.equal(action.what, "petrol ₪35");
});
