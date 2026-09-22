// What Baketly would like to tell this baker, and when.
//
// Deliberately not a sender. A phone build asks for the next few days and
// hands them to the operating system to raise locally; a web build would ask
// on a timer and push them. Both ask here, so the rules about what is due live
// in one place and neither has to reimplement them.

import { Router, type IRouter, type Request, type Response } from "express";
import { loadWorkspace } from "../lib/ask/workspace";
import { readSettings, upcomingReminders } from "../lib/reminders/schedule";
import { requireUser } from "../lib/session";

const router: IRouter = Router();

const MAX_DAYS = 30;

router.get("/reminders/upcoming", requireUser, async (req: Request, res: Response) => {
  try {
    const workspace = await loadWorkspace(req.user!.id);
    const settings = readSettings(workspace.reminders);
    // A phone asks for a fortnight and schedules what it gets; anything longer
    // is guesswork about a to-do list that has not been written yet.
    const requested = Number(req.query.days);
    const days = Number.isFinite(requested)
      ? Math.min(MAX_DAYS, Math.max(1, Math.round(requested)))
      : 14;

    const timezone =
      typeof req.query.timezone === "string" && req.query.timezone
        ? req.query.timezone.slice(0, 60)
        : settings.timezone;

    const reminders = upcomingReminders({ ...workspace }, { ...settings, timezone }, new Date(), days);
    res.json({ settings: { ...settings, timezone }, reminders });
  } catch (error) {
    req.log.warn({ err: error }, "Upcoming reminders failed");
    res.status(502).json({ error: "Could not work out your reminders." });
  }
});

export default router;
