import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCEPT_THRESHOLD, matchProducts } from "./matching";
import { normalizeProduct } from "./normalize";

const SIX_COOKIES = "Box of 6 Classic Chocolate Chip Cookies";

function match(mine: string, theirs: string) {
  return matchProducts(normalizeProduct(mine), normalizeProduct(theirs));
}

function accepted(mine: string, theirs: string): boolean {
  return match(mine, theirs).matchScore >= ACCEPT_THRESHOLD;
}

test("a different count of the same cookie is comparable", () => {
  const half = match(SIX_COOKIES, "Half Dozen Chocolate Chunk Cookies");
  assert.ok(half.matchScore >= 0.82, "expected a high match, got " + half.matchScore);
  assert.equal(half.matchQuality, "high");

  const twelve = match(SIX_COOKIES, "12 Chocolate Chip Cookies");
  assert.ok(accepted(SIX_COOKIES, "12 Chocolate Chip Cookies"), "12 cookies should compare");
  assert.ok(twelve.reasons.some((reason) => reason.includes("quantity")));
});

test("a single cookie is comparable to a box of six", () => {
  assert.ok(accepted(SIX_COOKIES, "Single Chocolate Chip Cookie"));
});

test("chocolate chip and chocolate chunk are the same flavour", () => {
  const result = match("6 Chocolate Chip Cookies", "6 Chocolate Chunk Cookies");
  assert.ok(result.reasons.includes("same flavour"));
});

test("a cookie cake is not a cookie", () => {
  const result = match(SIX_COOKIES, "Giant 1lb Chocolate Chip Cookie Cake");
  assert.equal(result.matchQuality, "rejected");
  assert.ok(result.rejections[0].includes("different kind of product"));
});

test("a mini cookie party tray is not a box of six cookies", () => {
  assert.ok(!accepted(SIX_COOKIES, "Mini Cookie Party Tray"));
});

test("an assorted box is not a single-flavour box", () => {
  assert.ok(!accepted(SIX_COOKIES, "Assorted Cookie Box (12)"));
});

test("a gluten-free luxury stuffed cookie is not a basic cookie", () => {
  assert.ok(!accepted(SIX_COOKIES, "Gluten-Free Luxury Stuffed Cookie"));
});

test("cupcakes compare across counts", () => {
  assert.ok(accepted("6 Vanilla Cupcakes", "12 Vanilla Cupcakes"));
});

test("cake sizes: two inches apart still compares, four does not", () => {
  const eightVsTen = match('8" Chocolate Cake', '10 inch Chocolate Cake');
  assert.ok(eightVsTen.matchScore >= ACCEPT_THRESHOLD, "8 vs 10 should compare");
  assert.equal(eightVsTen.matchQuality, "medium");

  const eightVsFourteen = match('8" Chocolate Cake', '14 inch Chocolate Cake');
  assert.ok(eightVsFourteen.matchScore < ACCEPT_THRESHOLD, "8 vs 14 should not compare");
});

test("a loaf compares with a loaf of its own kind, not with cake", () => {
  assert.ok(accepted("Sourdough Loaf 750g", "Country Sourdough 800g"));
  // a white tin loaf is a different bake at a different price
  assert.ok(!accepted("Sourdough Loaf 750g", "White Bread Loaf 800g"));
  assert.ok(!accepted("Sourdough Loaf 750g", "Chocolate Cake"));
});

// This test used to assert the opposite: that an unnamed "Artisan Loaf" was
// close enough to a sourdough to be worth showing. Run against five towns,
// that judgment produced a market. Brooklyn told a baker the local price of
// their 9.00 sourdough was 8.00, from a challah at 11.00 and a pizzeria's
// garlic bread at 4.99.
//
// It was also inconsistent: a shop that named its loaf "White Bread" was
// rejected, and a shop that said nothing was accepted, so vagueness scored
// better than honesty. A named loaf now needs a named loaf to price against.
test("a shop that will not say which loaf it is cannot price a named one", () => {
  assert.ok(!accepted("Sourdough Loaf 750g", "Artisan Loaf 800g"));
  assert.ok(!accepted("Sourdough Loaf", "Garlic Bread"));
  assert.ok(!accepted("Sourdough Loaf", "Raisin Pecan Loaf"));
  // a challah made with a sourdough starter is a challah
  assert.ok(!accepted("Sourdough Loaf", "Sourdough Challah"));
});

// A baker who wrote only "Loaf" made that stretch themselves, so it stays a
// doubt rather than a rejection -- otherwise they would never see anything.
test("a baker's own vague loaf still finds named ones", () => {
  assert.ok(accepted("Loaf", "Sourdough Loaf"));
});

// Pastry and croissant are near enough to price against each other, which
// without a named kind put a scone in the market for a croissant.
test("one pastry does not price another", () => {
  assert.ok(accepted("Croissant", "Almond Croissant"));
  assert.ok(!accepted("Croissant", "Cranberry Walnut Scone"));
  assert.ok(!accepted("Croissant", "Cherry Danish"));
  assert.ok(!accepted("Butter Scone", "Pain au Chocolat"));
});

// "Ham & Cheese Croissant" at 6.50 was in the market for a plain croissant.
test("a filling makes it a different proposition", () => {
  assert.ok(!accepted("Croissant", "Ham & Cheese Croissant"));
  assert.ok(!accepted("Bagel", "Bacon Cheddar Bagel"));
  // and the fillings that can be sweet are left alone
  assert.ok(accepted("Cheese Danish", "Cream Cheese Danish"));
});

test("a rejection says why", () => {
  const result = match(SIX_COOKIES, "Mini Cookie Party Tray");
  assert.ok(result.rejections.length > 0);
  assert.ok(result.rejections.some((reason) => reason.includes("mini")));
});

test("a product nobody can categorise is never counted", () => {
  const result = match(SIX_COOKIES, "Seasonal Special");
  assert.equal(result.matchQuality, "rejected");
  assert.equal(result.matchScore, 0);
});

test("a sandwich named after a loaf is not a loaf", () => {
  assert.ok(!accepted("Sourdough Loaf", "Sourdough Grilled Cheese"));
  assert.ok(!accepted("Sourdough Loaf", "Reuben on Rye Bread"));
  assert.ok(!accepted("Sourdough Loaf", "Turkey Sandwich on Sourdough"));
  assert.ok(!accepted("Box of 6 Chocolate Chip Cookies", "Breakfast Sandwich"));
});

test("a drink is never a bake", () => {
  assert.ok(!accepted("Box of 6 Chocolate Chip Cookies", "Cookie Lover's Hot Chocolate"));
  assert.ok(!accepted("Box of 6 Chocolate Chip Cookies", "Cookie Butter Latte"));
  assert.ok(!accepted("Sourdough Loaf", "Fresh Lemonade"));
});

test("a gift card is not a product to price against", () => {
  assert.ok(!accepted("Sourdough Loaf", "Gift Card"));
  assert.ok(!accepted("Box of 6 Chocolate Chip Cookies", "Baking Class Ticket"));
});

test("one loaf does not price against another kind of loaf", () => {
  assert.ok(!accepted("Sourdough Loaf", "Challah"));
  assert.ok(!accepted("Sourdough Loaf", "Baguette"));
  assert.ok(!accepted("Sourdough Loaf", "Everything Bagel"));
  // the same loaf, named differently, still compares
  assert.ok(accepted("Sourdough Loaf", "Country Sourdough Boule"));
  assert.ok(accepted("Sourdough Loaf 750g", "Rosemary Sourdough Loaf"));
});
