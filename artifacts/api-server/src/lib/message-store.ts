// Where a baker's message is kept until it is read.
//
// The same shape as the other stores: Postgres in production, memory when the
// server is running without a database, so the form can be exercised on a
// laptop without one.

import { desc } from "drizzle-orm";
import { db, messagesTable, type Message } from "@workspace/db";
import { authStoreIsEphemeral } from "./auth-store";

export interface NewMessage {
  userId: string | null;
  email: string;
  topic: string;
  subject: string;
  body: string;
}

export interface MessageStore {
  add(message: NewMessage): Promise<Message>;
  /** Newest first, for whoever is reading them. */
  recent(limit: number): Promise<Message[]>;
}

function newId(): string {
  return "msg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

class DrizzleMessageStore implements MessageStore {
  async add(message: NewMessage): Promise<Message> {
    const [row] = await db
      .insert(messagesTable)
      .values({ id: newId(), ...message })
      .returning();
    return row;
  }
  async recent(limit: number): Promise<Message[]> {
    return db.select().from(messagesTable).orderBy(desc(messagesTable.createdAt)).limit(limit);
  }
}

class MemoryMessageStore implements MessageStore {
  private rows: Message[] = [];
  async add(message: NewMessage): Promise<Message> {
    const row = {
      id: newId(),
      appVersion: null,
      createdAt: new Date(),
      ...message,
    } as Message;
    this.rows.unshift(row);
    return row;
  }
  async recent(limit: number): Promise<Message[]> {
    return this.rows.slice(0, limit);
  }
}

export const messageStore: MessageStore = authStoreIsEphemeral
  ? new MemoryMessageStore()
  : new DrizzleMessageStore();
