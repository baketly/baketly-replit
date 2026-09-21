import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyFrom, parsePrice } from "./price";

test("reads a price however a shop writes it", () => {
  assert.equal(parsePrice("$18")?.price, 18);
  assert.equal(parsePrice("18.00 USD")?.price, 18);
  assert.equal(parsePrice("£4.50")?.price, 4.5);
  assert.equal(parsePrice("€18,50")?.price, 18.5);
  assert.equal(parsePrice("₪45")?.price, 45);
  assert.equal(parsePrice("1,250.00")?.price, 1250);
});

test("knows which currency it is in", () => {
  assert.equal(parsePrice("$18")?.currency, "USD");
  assert.equal(parsePrice("€18,50")?.currency, "EUR");
  assert.equal(parsePrice("£4.50")?.currency, "GBP");
  assert.equal(parsePrice("₪45")?.currency, "ILS");
  assert.equal(currencyFrom("Prices in USD"), "USD");
  // no symbol: the shop's own currency stands in, and nothing is guessed
  assert.equal(parsePrice("18.00")?.currency, null);
  assert.equal(parsePrice("18.00", "GBP")?.currency, "GBP");
});

test("a sale price is what the shop charges today", () => {
  const sale = parsePrice("Was $22.00 Now $18.00");
  assert.equal(sale?.price, 18);
  assert.equal(sale?.isSale, true);
});

test("'starting at' is flagged, not treated as the price of one thing", () => {
  const from = parsePrice("From $45");
  assert.equal(from?.price, 45);
  assert.equal(from?.isFrom, true);
  assert.equal(parsePrice("Custom cakes starting at £60")?.isFrom, true);
});

test("no number is no price", () => {
  assert.equal(parsePrice("Price on request"), null);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("Sold out"), null);
});
