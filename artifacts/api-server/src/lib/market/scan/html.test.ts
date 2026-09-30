import assert from "node:assert/strict";
import { test } from "node:test";
import { extractHtml } from "./html";

const at = (products: ReturnType<typeof extractHtml>, name: string) =>
  products.find((product) => product.name.toLowerCase().includes(name.toLowerCase()));

// A menu writes the product once, as a heading, and then lists the flavours.
// Reading only the item names threw away forty-two products on a single check
// — "Glazed", "Boston Cream", "Funfetti" — every one rejected for not saying
// what it was.
test("a flavour under a heading takes the heading's kind", () => {
  const page = `
    <h2>Donuts</h2>
    <div><span class="product-title">Glazed</span><span class="price">$3.50</span></div>
    <div><span class="product-title">Boston Cream</span><span class="price">$4.25</span></div>
    <h2>Cookies</h2>
    <div><span class="product-title">Funfetti</span><span class="price">$3.00</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");

  assert.equal(at(found, "Glazed")?.category, "donut");
  assert.equal(at(found, "Boston Cream")?.category, "donut");
  assert.equal(at(found, "Funfetti")?.category, "cookie");
});

test("the nearest heading wins, not the first one on the page", () => {
  const page = `
    <h2>Breads</h2>
    <div><span class="product-title">Country</span><span class="price">$8.00</span></div>
    <h2>Cupcakes</h2>
    <div><span class="product-title">Red Velvet</span><span class="price">$4.00</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "Red Velvet")?.category, "cupcake");
});

// The reason page-wide categories were dropped in the first place.
test("a heading never overrules what the product's own name says", () => {
  const page = `
    <h2>Breads</h2>
    <div><span class="product-title">Chocolate Cupcake</span><span class="price">$4.00</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "Chocolate Cupcake")?.category, "cupcake");
});

test("a heading far above a price is a different part of the menu", () => {
  const page =
    `<h2>Donuts</h2>` +
    `<div>${"filler text that is not a product ".repeat(200)}</div>` +
    `<div><span class="product-title">Mystery Item</span><span class="price">$3.00</span></div>`;
  const found = extractHtml(page, "https://example.com/menu");
  // out of reach, so it stays unknown rather than being called a donut
  assert.notEqual(at(found, "Mystery Item")?.category, "donut");
});

test("a drink under a bread heading is still not a bread", () => {
  const page = `
    <h2>Breads</h2>
    <div><span class="product-title">Bottled Water</span><span class="price">$2.00</span></div>
    <div><span class="product-title">Cold Brew Coffee</span><span class="price">$5.00</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  for (const drink of ["Bottled Water", "Cold Brew"]) {
    const product = at(found, drink);
    // either dropped outright or left uncategorised — never sold as bread
    assert.notEqual(product?.category, "bread", drink);
  }
});

// Shops write a price above a range of sizes, and it was being read as the
// name of a product — then matched against, then rejected. Noise all the way
// through, and three of them on one Brooklyn check.
test("a price is not a product name", () => {
  const page = `
    <h2>Cakes</h2>
    <div><span class="product-title">from $40.00</span><span class="price">$40.00</span></div>
    <div><span class="product-title">Carrot Cake</span><span class="price">$42.00</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "from $"), undefined);
  assert.ok(at(found, "Carrot Cake"), "the real product is still read");
});

test("a size on its own is not a product name", () => {
  const page = `
    <h2>Breads</h2>
    <div><span class="product-title">500g</span><span class="price">$6.00</span></div>
    <div><span class="product-title">Large</span><span class="price">$9.00</span></div>
    <div><span class="product-title">Seeded Rye</span><span class="price">$7.50</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "500g"), undefined);
  assert.equal(at(found, "Large"), undefined);
  assert.ok(at(found, "Seeded Rye"));
});
