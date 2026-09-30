import assert from "node:assert/strict";
import { test } from "node:test";
import { emailReceipt, receiptHtml, receiptText, type Receipt } from "./receipt-email";

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    to: "customer@example.com",
    bakeryName: "Base Street Bakes",
    total: 17.5,
    currency: "USD",
    method: "Cash",
    lines: [
      { name: "Sourdough loaf", quantity: 1, price: 9 },
      { name: "Croissant", quantity: 2, price: 4.25 },
    ],
    soldAt: "2026-10-01T09:30:00.000Z",
    ...over,
  };
}

// The customer reads this, and they were standing at the stall when they paid.
// A line that does not add up is worse than no receipt at all.
test("a line of several costs what several cost", () => {
  const text = receiptText(receipt());
  assert.match(text, /Croissant x2 {2}\$8\.50/);
  assert.match(text, /Sourdough loaf {2}\$9\.00/);
  assert.match(text, /Total {2}\$17\.50/);
});

test("one of something says neither a count nor a unit price", () => {
  const html = receiptHtml(receipt({ lines: [{ name: "Sourdough loaf", quantity: 1, price: 9 }] }));
  assert.ok(!html.includes("× 1"));
  assert.ok(!html.includes("each"));
});

test("the shop's name is the shop's, and a customer sees how they paid", () => {
  const text = receiptText(receipt({ bakeryName: "Zu Bakery", method: "Card" }));
  assert.match(text, /^Zu Bakery/);
  assert.match(text, /Paid by card/);
});

test("each currency is written the way its customers read it", () => {
  assert.match(receiptText(receipt({ currency: "GBP" })), /Total {2}£17\.50/);
  assert.match(receiptText(receipt({ currency: "ILS" })), /Total {2}₪17\.50/);
  // one nobody has a symbol for still says which money it is
  assert.match(receiptText(receipt({ currency: "SEK" })), /Total {2}17\.50 SEK/);
});

test("a bakery named with an angle bracket cannot write the email", () => {
  const html = receiptHtml(receipt({ bakeryName: "<script>alert(1)</script>" }));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("a date that makes no sense is left off rather than printed wrong", () => {
  const text = receiptText(receipt({ soldAt: "not a date" }));
  assert.ok(!text.includes("Invalid"));
  assert.match(text, /^Base Street Bakes\nReceipt\n/);
});

// The till says what happened, so what happened has to come back.
test("with no mail key the receipt is reported unsent, not quietly dropped", async () => {
  const key = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    const result = await emailReceipt(receipt());
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.reason.length > 0);
  } finally {
    if (key !== undefined) process.env.RESEND_API_KEY = key;
  }
});
