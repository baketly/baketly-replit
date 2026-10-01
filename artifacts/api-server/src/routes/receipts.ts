// Emailing a customer their receipt.
//
// Signed in, and rate limited per baker: a till sits open all day at a market
// and a stuck button should not become a thousand emails.

import { json, Router, type IRouter, type Request, type Response } from "express";
import { emailReceipt, type Receipt, type ReceiptLine } from "../lib/receipt-email";
import { requireUser } from "../lib/session";

const router: IRouter = Router();

/** A busy stall is maybe forty sales in an hour; this is well clear of that. */
const PER_HOUR = 120;
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
  if (sentRecently.size > 5_000) {
    for (const [key, stamps] of sentRecently) {
      if (!stamps.some((at) => at > hourAgo)) sentRecently.delete(key);
    }
  }
  return true;
}

// Deliberately strict rather than clever: an address with a dot in the domain
// and no spaces. Anything a real customer dictates at a stall passes this, and
// the provider does the real checking.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Parsed {
  receipt?: Receipt;
  error?: string;
}

function readReceipt(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { error: "Nothing to send." };
  const raw = body as Record<string, unknown>;

  const to = typeof raw.to === "string" ? raw.to.trim() : "";
  if (!EMAIL.test(to) || to.length > 200) return { error: "That does not look like an email address." };

  const total = typeof raw.total === "number" && isFinite(raw.total) ? raw.total : null;
  if (total === null || total < 0) return { error: "Nothing to send." };

  const lines: ReceiptLine[] = (Array.isArray(raw.lines) ? raw.lines : [])
    .slice(0, 60)
    .map((entry) => {
      const line = (entry || {}) as Record<string, unknown>;
      return {
        name: String(line.name || "").slice(0, 120),
        quantity: Number(line.quantity) > 0 ? Math.min(999, Math.floor(Number(line.quantity))) : 1,
        price: typeof line.price === "number" && isFinite(line.price) ? line.price : 0,
      };
    })
    .filter((line) => line.name);

  // A sale with no lines is still a sale.
  //
  // The till takes a typed amount as well as a basket -- somebody buys a thing
  // that was never set up as a recipe, the baker types the price, they pay.
  // That receipt has a total and nothing to itemise, and refusing it told the
  // baker "Nothing to send" about a sale that had just happened.
  if (lines.length === 0 && total <= 0) return { error: "Nothing to send." };

  return {
    receipt: {
      to,
      bakeryName: (typeof raw.bakeryName === "string" && raw.bakeryName.trim()
        ? raw.bakeryName.trim()
        : "Baketly"
      ).slice(0, 80),
      total,
      currency: typeof raw.currency === "string" && raw.currency ? raw.currency.slice(0, 8) : "USD",
      method: typeof raw.method === "string" && raw.method ? raw.method.slice(0, 20) : "Cash",
      lines,
      soldAt: typeof raw.soldAt === "string" ? raw.soldAt : new Date().toISOString(),
    },
  };
}

router.post("/receipts", requireUser, json({ limit: "16kb" }), async (req: Request, res: Response) => {
  const parsed = readReceipt(req.body);
  if (!parsed.receipt) {
    res.status(400).json({ error: parsed.error || "Nothing to send." });
    return;
  }

  const user = req.user!;
  if (!withinRate(user.id)) {
    res.status(429).json({ error: "That is a lot of receipts at once. Try again shortly." });
    return;
  }

  const result = await emailReceipt(parsed.receipt);
  if (!result.ok) {
    // 502, not 400: the baker did nothing wrong and the address may be fine.
    res.status(502).json({ error: result.reason });
    return;
  }
  res.json({ sent: true });
});

export default router;
