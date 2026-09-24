// Which token a request is presenting.
//
// Kept apart from the rest of the session so it can be read and tested on its
// own: everything else in session.ts reaches the database, and this decides
// nothing more than what the request said.

import type { Request } from "express";

import { SESSION_COOKIE } from "./session-cookie";

/**
 * The session tokens a request offers, cookie first.
 *
 * Both can arrive at once: the app keeps a bearer token and the web view
 * still sends whatever cookie it holds. Preferring the cookie and stopping
 * there signed people out whenever the cookie had gone stale but the token
 * was good, so each is tried in turn and the first that names a live session
 * wins.
 */
export function tokensFrom(req: Request): string[] {
  const offered: string[] = [];
  const cookie = req.signedCookies?.[SESSION_COOKIE];
  if (typeof cookie === "string" && cookie) offered.push(cookie);
  const header = req.get("authorization") || "";
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const token = bearer[1].trim();
    if (token && !offered.includes(token)) offered.push(token);
  }
  return offered;
}
