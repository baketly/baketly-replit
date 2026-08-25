import { Router, type IRouter, type Request, type Response } from "express";
import { workspaceStatePayloadSchema } from "@workspace/db";
import { requireUser } from "../lib/session";
import { workspaceStore } from "../lib/workspace-store";

const router: IRouter = Router();

/**
 * A baker's whole workspace: ingredients, packaging, recipes, sales and events.
 *
 * Both routes sit behind requireUser and address the row by the id on the
 * session's user. Nothing here reads a user id or email from the request, so
 * there is no parameter to tamper with — a signed-in baker can only ever reach
 * their own row.
 */
router.get("/workspace-state", requireUser, async (req: Request, res: Response): Promise<void> => {
  const record = await workspaceStore.get(req.user!.id);
  const parsed = workspaceStatePayloadSchema.safeParse(record?.data ?? {});
  res.json({
    state: parsed.success ? parsed.data : {},
    updatedAt: record?.updatedAt ?? null,
  });
});

router.put("/workspace-state", requireUser, async (req: Request, res: Response): Promise<void> => {
  const parsed = workspaceStatePayloadSchema.safeParse(req.body?.state);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid workspace state");
    res.status(400).json({ error: "State must be an object." });
    return;
  }

  const record = await workspaceStore.put(req.user!.id, parsed.data);
  res.json({ state: record.data, updatedAt: record.updatedAt });
});

export default router;
