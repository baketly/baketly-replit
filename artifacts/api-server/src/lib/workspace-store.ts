import { eq } from "drizzle-orm";
import { db, workspaceStateTable } from "@workspace/db";
import { authStoreIsEphemeral } from "./auth-store";

export type WorkspaceRecord = { data: unknown; updatedAt: Date } | null;

export interface WorkspaceStore {
  get(userId: string): Promise<WorkspaceRecord>;
  put(userId: string, data: unknown): Promise<{ data: unknown; updatedAt: Date }>;
  /** Deleting an account has to take the bakery with it, or the recipes and
   *  sales outlive the person who asked to be forgotten. */
  remove(userId: string): Promise<void>;
}

class DrizzleWorkspaceStore implements WorkspaceStore {
  async get(userId: string): Promise<WorkspaceRecord> {
    const [row] = await db
      .select()
      .from(workspaceStateTable)
      .where(eq(workspaceStateTable.id, userId));
    return row ? { data: row.data, updatedAt: row.updatedAt } : null;
  }
  async put(userId: string, data: unknown) {
    const [row] = await db
      .insert(workspaceStateTable)
      .values({ id: userId, data: data as never })
      .onConflictDoUpdate({
        target: workspaceStateTable.id,
        set: { data: data as never, updatedAt: new Date() },
      })
      .returning();
    return { data: row.data, updatedAt: row.updatedAt };
  }
  async remove(userId: string): Promise<void> {
    await db.delete(workspaceStateTable).where(eq(workspaceStateTable.id, userId));
  }
}

/**
 * Development only, alongside the in-memory auth store, so the sign-in flow and
 * the separation between accounts can be exercised without a database. Keyed by
 * user id exactly as the table is.
 */
class MemoryWorkspaceStore implements WorkspaceStore {
  private rows = new Map<string, { data: unknown; updatedAt: Date }>();
  async get(userId: string): Promise<WorkspaceRecord> {
    return this.rows.get(userId) ?? null;
  }
  async put(userId: string, data: unknown) {
    const row = { data, updatedAt: new Date() };
    this.rows.set(userId, row);
    return row;
  }
  async remove(userId: string) {
    this.rows.delete(userId);
  }
}

export const workspaceStore: WorkspaceStore = authStoreIsEphemeral
  ? new MemoryWorkspaceStore()
  : new DrizzleWorkspaceStore();
