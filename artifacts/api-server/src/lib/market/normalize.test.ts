import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProduct, parseDiameterInches, parseQuantity, parseWeight } from "./normalize";

test("reads a count however it is written", () => {
  assert.equal(parseQuantity("box of 6 classic chocolate chip cookies"), 6);
  assert.equal(parseQuantity("half dozen chocolate chunk cookies"), 6);
  assert.equal(parseQuantity("1/2 dozen cookies"), 6);
  assert.equal(parseQuantity("dozen cookies"), 12);
  assert.equal(parseQuantity("2 dozen cookies"), 24);
  assert.equal(parseQuantity("6 pack brownies"), 6);
  assert.equal(parseQuantity("cookies x 12"), 12);
  assert.equal(parseQuantity("single chocolate chip cookie"), 1);
  assert.equal(parseQuantity("12 piece macaron selection"), 12);
});

test("a name with no count has no count, rather than a guess", () => {
  assert.equal(parseQuantity("chocolate chip cookie"), null);
  assert.equal(parseQuantity("sourdough loaf"), null);
});

test("reads weights and sizes", () => {
  assert.deepEqual(parseWeight("sourdough loaf 750g"), { weight: 750, weightUnit: "g" });
  assert.deepEqual(parseWeight("giant 1 lb cookie cake"), { weight: 1, weightUnit: "lb" });
  assert.deepEqual(parseWeight("16 oz brownie slab"), { weight: 16, weightUnit: "oz" });
  assert.equal(parseDiameterInches('8" chocolate cake'), 8);
  assert.equal(parseDiameterInches("10 inch birthday cake"), 10);
  // centimetres are read and converted, so sizes compare
  assert.equal(parseDiameterInches("20cm cake"), 7.9);
});

test("the baker's product and a competitor's read into the same shape", () => {
  const mine = normalizeProduct("Box of 6 Classic Chocolate Chip Cookies");
  const theirs = normalizeProduct("Half Dozen Chocolate Chunk Cookies");
  assert.equal(mine.category, "cookie");
  assert.equal(theirs.category, "cookie");
  assert.equal(mine.quantity, 6);
  assert.equal(theirs.quantity, 6);
  assert.equal(mine.flavor, "chocolate_chip");
  assert.equal(theirs.flavor, "chocolate_chip");
  assert.equal(mine.unit, "piece");
});

test("a cookie cake is a cake, not a cookie", () => {
  const cookieCake = normalizeProduct("Giant 1lb Chocolate Chip Cookie Cake");
  assert.equal(cookieCake.category, "cake");
  assert.equal(cookieCake.subcategory, "cookie_cake");
  assert.ok(cookieCake.attributes.includes("giant"));
});

test("picks up the kind of version a product is", () => {
  assert.ok(normalizeProduct("Mini Cookie Party Tray").attributes.includes("mini"));
  assert.ok(normalizeProduct("Mini Cookie Party Tray").attributes.includes("tray"));
  assert.ok(normalizeProduct("Assorted Cookie Box").attributes.includes("assorted"));
  assert.ok(
    normalizeProduct("Gluten-Free Stuffed Luxury Cookie").attributes.includes("gluten_free"),
  );
  assert.ok(normalizeProduct("Gluten-Free Stuffed Luxury Cookie").attributes.includes("stuffed"));
});

test("knows the bakery categories apart", () => {
  const cases: Array<[string, string]> = [
    ["Vanilla Cupcakes 6 pack", "cupcake"],
    ["Fudge Brownies", "brownie"],
    ["Blueberry Muffins", "muffin"],
    ["Pistachio Macarons", "macaron"],
    ["Apple Pie", "pie"],
    ["New York Cheesecake", "cheesecake"],
    ["Sourdough Loaf", "sourdough"],
    ["Butter Croissant", "croissant"],
    ["Glazed Donuts", "donut"],
    ["Cinnamon Rolls", "cinnamon_roll"],
    ["Cake Pops", "cake_pop"],
    ["Dessert Box", "dessert_box"],
    ["Mini Nutella Babka", "babka"],
  ];
  for (const [name, category] of cases) {
    assert.equal(normalizeProduct(name).category, category, name);
  }
});
