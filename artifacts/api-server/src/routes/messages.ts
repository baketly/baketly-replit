// A baker writing in.
//
// Two routes: one for sending, which any signed-in baker may use, and one for
// reading, which only an admin may. The second exists so the messages can
// actually be read without going to the database by hand.
//
// A message is also logged as it arrives. Logs are watched when a deployment
// is watched, and a suggestion arriving is worth noticing on the day rather
// than whenever someone remembers to look.

import { json, Router, type IRouter, type Request, type Response } from "express";
import { messagePayloadSchema } from "@workspace/db";
import { emailContactMessage } from "../lib/contact-email";
import { messageStore } from "../lib/message-store";
import { isAdmin, requireUser } from "../lib/session";

const router: IRouter = Router();

/** How many a baker may send before they are asked to wait. */
const PER_HOUR = 6;
const sentRecently = new Map<string, number[]>();

function withinRate(userId: string): boolean {
  const hourAgo = Date.now() - 60 * 60_000;
  const times = (sentRecently.get(userId) || []).filter((at) => at > hourAgo);
  if (times.length >= PER_HOUR) {
    sentRecently.set(userId, times);
    return false;
  }
  times.push(Date.now());
  sentRecently.set(userId, times);
  // the map would otherwise hold every baker who has ever written in
  if (sentRecently.size > 5_000) {
    for (const [key, stamps] of sentRecently) {
      if (!stamps.some((at) => at > hourAgo)) sentRecently.delete(key);
    }
  }
  return true;
}

router.post("/messages", requireUser, json({ limit: "16kb" }), async (req: Request, res: Response) => {
  const parsed = messagePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Choose what this is about, and write a subject and a message.",
    });
    return;
  }

  const user = req.user!;
  if (!withinRate(user.id)) {
    res.status(429).json({
      error: "That is a lot of messages at once. Try again in a little while.",
    });
    return;
  }

  try {
    const saved = await messageStore.add({
      userId: user.id,
      email: user.email,
      topic: parsed.data.topic,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });
    req.log.info(
      { messageId: saved.id, topic: saved.topic, from: saved.email, subject: saved.subject },
      "Message from a baker",
    );
    // the row is safe, so the baker is told so now; the email is a nudge that
    // one is waiting, and waiting on a mail provider before answering would
    // only make a slow provider look like a broken form
    res.status(201).json({ ok: true });
    void emailContactMessage({
      id: saved.id,
      email: saved.email,
      topic: saved.topic,
      subject: saved.subject,
      body: saved.body,
    });
  } catch (error) {
    req.log.error({ err: error }, "Could not save a message");
    res.status(503).json({ error: "That did not send. Try again in a moment." });
  }
});

router.get("/messages", requireUser, async (req: Request, res: Response) => {
  // Not "no such route": the baker is signed in, and this is simply not
  // theirs to read.
  if (!isAdmin(req.user!)) {
    res.status(403).json({ error: "Not yours to read." });
    return;
  }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json({ messages: await messageStore.recent(limit) });
});

export default router;
