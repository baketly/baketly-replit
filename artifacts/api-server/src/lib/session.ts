import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { User } from "@workspace/db";
import { authStore, hashToken } from "./auth-store";

export const SESSION_COOKIE = "baketly_session";
const SESSION_DAYS = 30;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    maxAge: maxAgeMs,
    // lax still sends the cookie on the redirect back from Google, while
    // keeping it off cross-site POSTs
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    signed: true,
    path: "/",
  };
}

/**
 * Starts a session and returns its token.
 *
 * The cookie is still set, and the browser still uses it. The token is
 * returned as well for the phone app: inside a native shell the page is served
 * from capacitor://localhost while the API is a different site entirely, and
 * iOS will not carry a cookie across that. The app keeps the token itself and
 * sends it as a bearer header. Same session, same table, two ways of proving
 * it is yours.
 */
export async function startSession(res: Response, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await authStore.createSession(userId, hashToken(token), expiresAt);
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60 * 1000));
  return token;
}

/** The session token on a request, from the cookie or the bearer header. */
function tokenFrom(req: Request): string | null {
  const cookie = req.signedCookies?.[SESSION_COOKIE];
  if (typeof cookie === "string" && cookie) return cookie;
  const header = req.get("authorization") || "";
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : null;
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = tokenFrom(req);
  if (token) await authStore.deleteSession(hashToken(token));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

/**
 * Resolves the session to a user, or null.
 *
 * Only ever the cookie or the bearer token — never a user id, email or
 * workspace id from a body, query or header, which would let anyone read
 * another bakery by typing its address.
 */
export async function currentUser(req: Request): Promise<User | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const session = await authStore.findSession(hashToken(token));
  if (!session) return null;
  return authStore.findUserById(session.userId);
}

/**
 * Gate for anything that touches a baker's data.
 *
 * The identity comes from the signed cookie alone. No route may accept a user
 * id or email from the request body or query: that would let anyone read
 * another account by typing its address.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  currentUser(req)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: "Sign in to continue." });
        return;
      }
      req.user = user;
      next();
    })
    .catch((error) => {
      req.log.warn({ err: error }, "Session lookup failed");
      res.status(503).json({ error: "Could not check your session. Try again." });
    });
}

export const isAdmin = (user: User): boolean =>
  user.email.toLowerCase() === "contact@baketly.com";
