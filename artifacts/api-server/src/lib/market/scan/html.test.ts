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

// A loaf's menu line read "Half $7.95 | Whole $13.00" just above its price,
// and that line was stored as the name of a bread.
test("a line of prices is not the name of a product", () => {
  const page = `
    <h2>Breads</h2>
    <div><span class="product-title">Half $7.95 | Whole $13.00</span><span class="price">$7.95</span></div>
    <div><span class="product-title">Walnut Loaf</span><span class="price">$7.55</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "Half $"), undefined);
  assert.ok(at(found, "Walnut Loaf"));
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

// A cookie shop names its cookies "Funfetti" and "S'mores" and never writes
// the word cookie, because the sentence underneath does. On one sweep 63% of
// everything read came back as a name nothing could be told from, and those
// sentences were sitting unused next to them.
test("a product's own blurb names what its name does not", () => {
  const page = `
    <div>
      <span class="product-title">Funfetti</span>
      <p>Indulge in the playful combination of our buttery, sweet sugar cookie.</p>
      <span class="price">$5.80</span>
    </div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "Funfetti")?.category, "cookie");
});

test("a section heading still beats the blurb where a page has one", () => {
  const page = `
    <h2>Donuts</h2>
    <div>
      <span class="product-title">Boston Cream</span>
      <span class="desc">Best with a cookie on the side</span>
      <span class="price">$3.50</span>
    </div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "Boston Cream")?.category, "donut");
});

// The blurb above sat in its own element, and the scanner read it as the name
// of the product. The store holds "Classic, refreshing soda with a timeless
// taste." as something a shop sells.
test("a one-sentence blurb is not read as the product's name", () => {
  const page = `
    <div>
      <span class="product-title">Boston Cream</span>
      <p>Best with a cookie on the side.</p>
      <span class="price">$3.50</span>
    </div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(
    found.some((product) => /best with a cookie/i.test(product.name)),
    false,
  );
});

test("a menu's footnote marker is not part of the name", () => {
  const page = `
    <div><span class="product-title">Pain au Levain*</span><span class="price">$6.50</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(found[0]?.name, "Pain au Levain");
  // and it is still read as the sourdough it is
  assert.equal(found[0]?.subcategory, "sourdough");
});

test("a theme's price label is not a product", () => {
  const page = `
    <div>
      <span class="product-title">Regular price</span><span class="price">$69.00</span>
      <span class="product-title">Sale price</span><span class="price">$59.00</span>
    </div>
  `;
  const found = extractHtml(page, "https://example.com/shop");
  assert.equal(found.length, 0);
});

test("a short name may still end in an abbreviation", () => {
  const page = `
    <div><span class="product-title">Bread Co.</span><span class="price">$6.00</span></div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(found.length, 1);
});

test("a blurb cannot overrule a name that already says what it is", () => {
  const page = `
    <div>
      <span class="product-title">Sourdough Loaf</span>
      <p>Our loaf is wonderful alongside a slice of cheesecake.</p>
      <span class="price">$9.00</span>
    </div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  assert.equal(at(found, "Sourdough Loaf")?.category, "sourdough");
});

test("a blurb mentioning a bake cannot make a drink into one", () => {
  const page = `
    <div>
      <span class="product-title">Cold Brew Coffee</span>
      <p>Perfect with any of our cookies or a slice of banana bread.</p>
      <span class="price">$5.00</span>
    </div>
  `;
  const found = extractHtml(page, "https://example.com/menu");
  const product = at(found, "Cold Brew");
  for (const bake of ["cookie", "bread"]) {
    assert.notEqual(product?.category, bake);
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
