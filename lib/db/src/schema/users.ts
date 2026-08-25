import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * A baker's account.
 *
 * Data is keyed by `id`, not by email: an email can be corrected or changed and
 * every ingredient, recipe, sale and event would otherwise have to move with
 * it. Email stays the thing a person signs in with, held unique and lowercased
 * so "Ada@x.com" and "ada@x.com" cannot become two accounts.
 *
 * passwordHash is null for an account created through Google, and googleSub is
 * null for one created with a password. An account may end up with both, which
 * is what lets someone sign up with a password and later use Google.
 */
export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_key").on(table.email),
    uniqueIndex("users_google_sub_key").on(table.googleSub),
  ],
);

/**
 * A signed-in session.
 *
 * `id` holds a SHA-256 of the session token, never the token itself. The token
 * only ever exists in the user's cookie, so a leaked database cannot be used to
 * take over live sessions. Rows are deleted on sign-out and ignored past
 * expiry.
 */
export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Enter a valid email address",
  });

// Long enough to be worth hashing, capped so a huge input cannot be used to
// make the key derivation expensive on purpose.
export const passwordSchema = z.string().min(8).max(200);

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(120).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export type User = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
