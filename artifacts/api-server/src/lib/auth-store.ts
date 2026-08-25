import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable, type Session, type User } from "@workspace/db";

export type NewUser = {
  email: string;
  displayName?: string | null;
  passwordHash?: string | null;
  googleSub?: string | null;
};

export interface AuthStore {
  findUserByEmail(email: string): Promise<User | null>;
  findUserByGoogleSub(sub: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(user: NewUser): Promise<User>;
  linkGoogle(userId: string, sub: string): Promise<void>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string): Promise<Session | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
}

/** Sessions are stored by hash; the token itself only lives in the cookie. */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

class DrizzleAuthStore implements AuthStore {
  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    return row ?? null;
  }
  async findUserByGoogleSub(sub: string): Promise<User | null> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.googleSub, sub));
    return row ?? null;
  }
  async findUserById(id: string): Promise<User | null> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return row ?? null;
  }
  async createUser(user: NewUser): Promise<User> {
    const [row] = await db
      .insert(usersTable)
      .values({
        id: randomUUID(),
        email: user.email,
        displayName: user.displayName ?? null,
        passwordHash: user.passwordHash ?? null,
        googleSub: user.googleSub ?? null,
      })
      .returning();
    return row;
  }
  async linkGoogle(userId: string, sub: string): Promise<void> {
    await db.update(usersTable).set({ googleSub: sub }).where(eq(usersTable.id, userId));
  }
  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.insert(sessionsTable).values({ id: tokenHash, userId, expiresAt });
  }
  async findSession(tokenHash: string): Promise<Session | null> {
    const [row] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, tokenHash), gt(sessionsTable.expiresAt, new Date())));
    return row ?? null;
  }
  async deleteSession(tokenHash: string): Promise<void> {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, tokenHash));
  }
  async deleteUserSessions(userId: string): Promise<void> {
    await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  }
}

/**
 * Development only, so the sign-in flow can be exercised without a database.
 * Enabled solely by AUTH_DEV_STORE=1 and refused when NODE_ENV is production,
 * so it cannot be reached by a misconfigured deploy. Everything is lost on
 * restart, which is the point: it is for trying the flow, not for keeping data.
 */
class MemoryAuthStore implements AuthStore {
  private users = new Map<string, User>();
  private sessions = new Map<string, Session>();

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }
  async findUserByGoogleSub(sub: string) {
    return [...this.users.values()].find((user) => user.googleSub === sub) ?? null;
  }
  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async createUser(user: NewUser) {
    const now = new Date();
    const row: User = {
      id: randomUUID(),
      email: user.email,
      displayName: user.displayName ?? null,
      passwordHash: user.passwordHash ?? null,
      googleSub: user.googleSub ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(row.id, row);
    return row;
  }
  async linkGoogle(userId: string, sub: string) {
    const row = this.users.get(userId);
    if (row) this.users.set(userId, { ...row, googleSub: sub });
  }
  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { id: tokenHash, userId, createdAt: new Date(), expiresAt });
  }
  async findSession(tokenHash: string) {
    const row = this.sessions.get(tokenHash);
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return row;
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async deleteUserSessions(userId: string) {
    for (const [key, row] of this.sessions) {
      if (row.userId === userId) this.sessions.delete(key);
    }
  }
}

const useMemoryStore =
  process.env.AUTH_DEV_STORE === "1" && process.env.NODE_ENV !== "production";

if (process.env.AUTH_DEV_STORE === "1" && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_DEV_STORE must never be set in production");
}

export const authStore: AuthStore = useMemoryStore
  ? new MemoryAuthStore()
  : new DrizzleAuthStore();

export const authStoreIsEphemeral = useMemoryStore;
