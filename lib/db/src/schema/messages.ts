// What bakers write to the person who makes Baketly.
//
// A suggestion, something broken, a question — kept here rather than sent as
// email, because email needs a provider, an address that survives, and a
// deliverability problem nobody wants on day one. A row in the database is
// read whenever it suits, and cannot bounce.
//
// The sender's address is copied onto the row rather than joined from the
// account. A baker who writes in and later deletes their account should still
// be answerable — and the reply address is part of what they sent.

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  // no foreign key: a message outlives the account that sent it
  userId: text("user_id"),
  email: text("email").notNull(),
  topic: text("topic").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // what the app was when it was written, so an old report is read in context
  appVersion: text("app_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The topics offered in the app, and the only ones accepted. */
export const MESSAGE_TOPICS = [
  "suggestion",
  "problem",
  "question",
  "other",
] as const;

export const messagePayloadSchema = z
  .object({
    topic: z.enum(MESSAGE_TOPICS),
    subject: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4_000),
  })
  .strict();

export type MessagePayload = z.infer<typeof messagePayloadSchema>;
export type Message = typeof messagesTable.$inferSelect;
