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

test("sourdough compares with bread, not with cake", () => {
  assert.ok(accepted("Sourdough Loaf 750g", "White Bread Loaf 800g"));
  assert.ok(!accepted("Sourdough Loaf 750g", "Chocolate Cake"));
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
