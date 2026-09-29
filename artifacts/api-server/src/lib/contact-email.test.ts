import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { emailContactMessage } from "./contact-email";

const message = {
  id: "msg_test1",
  email: "baker@example.com",
  topic: "problem",
  subject: "Booth fee overlaps the date",
  body: "On my phone the fee sits on top of the date.\n\nAlso a shopping list would help.",
};

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.CONTACT_EMAIL_TO;
});

test("without a key, nothing is sent and nothing throws", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch;
  assert.equal(await emailContactMessage(message), false);
  assert.equal(called, false);
});

test("the message reaches the inbox, addressed so a reply goes to the baker", async () => {
  process.env.RESEND_API_KEY = "test-key";
  let sent: any;
  globalThis.fetch = (async (_url: any, init: any) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  }) as typeof fetch;

  assert.equal(await emailContactMessage(message), true);
  assert.deepEqual(sent.to, ["contact@baketly.com"]);
  assert.equal(sent.reply_to, "baker@example.com");
  assert.match(sent.subject, /Not working/);
  assert.match(sent.subject, /Booth fee overlaps the date/);
  assert.match(sent.text, /shopping list/);
});

test("a baker's words cannot become markup in the email", async () => {
  process.env.RESEND_API_KEY = "test-key";
  let sent: any;
  globalThis.fetch = (async (_url: any, init: any) => {
    sent = JSON.parse(init.body);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  await emailContactMessage({ ...message, subject: "<script>x</script>" });
  assert.ok(!sent.html.includes("<script>"));
  assert.match(sent.html, /&lt;script&gt;/);
});

test("a provider that refuses is reported, not thrown", async () => {
  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response("no", { status: 422 })) as typeof fetch;
  assert.equal(await emailContactMessage(message), false);
});

test("a provider that is unreachable is reported, not thrown", async () => {
  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = (async () => {
    throw new Error("socket hang up");
  }) as typeof fetch;
  assert.equal(await emailContactMessage(message), false);
});
