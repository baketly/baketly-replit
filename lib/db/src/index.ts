import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Local development can run with no database at all: AUTH_DEV_STORE=1 swaps
// the auth and workspace stores for in-memory ones, and neither ever queries.
// Throwing here on import stopped that mode from starting, before either store
// had a chance to say it did not need a connection. The pool below only
// connects on its first query, so creating it without a URL is harmless there.
// Production still refuses to start without one.
const devWithoutDatabase =
  process.env.AUTH_DEV_STORE === "1" && process.env.NODE_ENV !== "production";

if (!process.env.DATABASE_URL && !devWithoutDatabase) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
