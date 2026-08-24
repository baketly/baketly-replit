import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  workspaceStatePayloadSchema,
  workspaceStateTable,
} from "@workspace/db";

const router: IRouter = Router();

function getSessionId(req: Parameters<typeof router.get>[1] extends (
  req: infer Request,
  ...args: never[]
) => unknown
  ? Request
  : never, res: Parameters<typeof router.get>[1] extends (
  ...args: infer Args
) => unknown
  ? Args[1]
  : never): string {
  const existing = req.signedCookies?.baketly_session;
  if (typeof existing === "string" && /^[0-9a-f-]{36}$/i.test(existing)) {
    return existing;
  }

  const sessionId = randomUUID();
  res.cookie("baketly_session", sessionId, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 180,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    signed: true,
  });
  return sessionId;
}

router.get("/workspace-state", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req, res);
  const [record] = await db
    .select()
    .from(workspaceStateTable)
    .where(eq(workspaceStateTable.id, sessionId));

  const parsed = workspaceStatePayloadSchema.safeParse(record?.data ?? {});
  res.json({
    state: parsed.success ? parsed.data : {},
    updatedAt: record?.updatedAt ?? null,
  });
});

router.put("/workspace-state", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req, res);
  const parsed = workspaceStatePayloadSchema.safeParse(req.body?.state);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid workspace state");
    res.status(400).json({ error: "State must be an object." });
    return;
  }

  const [record] = await db
    .insert(workspaceStateTable)
    .values({ id: sessionId, data: parsed.data })
    .onConflictDoUpdate({
      target: workspaceStateTable.id,
      set: { data: parsed.data, updatedAt: new Date() },
    })
    .returning();

  res.json({ state: record.data, updatedAt: record.updatedAt });
});

export default router;