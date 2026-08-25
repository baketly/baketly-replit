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

export async function startSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await authStore.createSession(userId, hashToken(token), expiresAt);
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60 * 1000));
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = req.signedCookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) {
    await authStore.deleteSession(hashToken(token));
  }
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

/** Resolves the cookie to a user, or null. Never trusts anything else. */
export async function currentUser(req: Request): Promise<User | null> {
  const token = req.signedCookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || !token) return null;
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
