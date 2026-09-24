import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { tokensFrom } from "./session-token.js";

/** Just enough of a request for the token reader. */
function request(options: { cookie?: string; authorization?: string }): Request {
  return {
    signedCookies: options.cookie ? { "baketly_session": options.cookie } : {},
    get: (name: string) =>
      name.toLowerCase() === "authorization" ? options.authorization : undefined,
  } as unknown as Request;
}

test("a browser sending only its cookie is read from the cookie", () => {
  assert.deepEqual(tokensFrom(request({ cookie: "from-cookie" })), ["from-cookie"]);
});

test("the app sending only a bearer token is read from the header", () => {
  assert.deepEqual(tokensFrom(request({ authorization: "Bearer from-header" })), ["from-header"]);
});

test("both are offered, so a stale cookie cannot hide a good token", () => {
  assert.deepEqual(
    tokensFrom(request({ cookie: "stale", authorization: "Bearer good" })),
    ["stale", "good"],
  );
});

test("the same token in both places is only tried once", () => {
  assert.deepEqual(tokensFrom(request({ cookie: "same", authorization: "Bearer same" })), ["same"]);
});

test("a header that is not a bearer token offers nothing", () => {
  assert.deepEqual(tokensFrom(request({ authorization: "Basic abc123" })), []);
  assert.deepEqual(tokensFrom(request({})), []);
});

test("bearer is matched however it is capitalised, and spacing is trimmed", () => {
  assert.deepEqual(tokensFrom(request({ authorization: "bearer   spaced  " })), ["spaced"]);
});
