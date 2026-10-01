// The waiting list on baketly.com.
//
// A plain form post rather than a fetch, which is the whole trick: a form
// submission is not subject to CORS, so the marketing site can live on its own
// domain and still reach this without the API having to allow its origin. It
// also works with no JavaScript at all, and the person ends up on a page that
// says what happened rather than guessing from a spinner.
//
// Open to anyone, which is unavoidable for a sign-up form and is why the rate
// limit below is per address rather than per account.

import { Router, urlencoded, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { policyContact } from "@workspace/policy";

const router: IRouter = Router();

const ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8_000;
const INBOX = process.env.PRIVACY_CONTACT_EMAIL || policyContact();

/** Deliberately strict: an address with a dot in the domain and no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * How many sign-ups one caller may send in an hour.
 *
 * Keyed on the caller's address because there is no account to key on. Low,
 * because a person signs up once and a script would like to send thousands.
 */
const PER_HOUR = 5;
const seen = new Map<string, number[]>();

function withinRate(who: string): boolean {
  const hourAgo = Date.now() - 60 * 60_000;
  const times = (seen.get(who) || []).filter((at) => at > hourAgo);
  if (times.length >= PER_HOUR) {
    seen.set(who, times);
    return false;
  }
  times.push(Date.now());
  seen.set(who, times);
  if (seen.size > 5_000) {
    for (const [key, stamps] of seen) {
      if (!stamps.some((at) => at > hourAgo)) seen.delete(key);
    }
  }
  return true;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The page somebody lands on after pressing the button. */
function page(heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Baketly</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 24px; background: #faf6f0; color: #1e1b16;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  .card {
    max-width: 440px; background: #fff; border: 1px solid #e4ded2;
    border-radius: 18px; padding: 32px 28px; text-align: center;
  }
  h1 { font-size: 23px; margin: 0 0 10px; }
  p { color: #3a352c; margin: 0 0 18px; }
  a { color: #5e6d31; }
</style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${body}</p>
    <p><a href="https://baketly.com">Back to baketly.com</a></p>
  </div>
</body>
</html>
`;
}

async function tell(address: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RECEIPT_EMAIL_FROM || process.env.CONTACT_EMAIL_FROM;
  if (!key || !from) {
    // Not a failure the signer-up should see: their address is in the log, and
    // the log is how it gets collected until a list exists.
    logger.warn({ address }, "Waiting list sign-up with no mail configured");
    return false;
  }
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [INBOX],
        reply_to: address,
        subject: "Baketly waiting list: " + address,
        text: address + " asked to hear when Baketly is ready.",
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error({ status: response.status }, "Could not forward a waiting list sign-up");
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, "Could not forward a waiting list sign-up");
    return false;
  }
}

router.post(
  "/waitlist",
  urlencoded({ extended: false, limit: "4kb" }),
  async (req: Request, res: Response) => {
    const address = String((req.body as { email?: unknown })?.email || "").trim();

    if (!EMAIL.test(address) || address.length > 200) {
      res
        .status(400)
        .type("html")
        .send(
          page(
            "That address did not look right",
            "Go back and check it, and we will let you know the day Baketly is ready.",
          ),
        );
      return;
    }

    const who = String(req.ip || req.socket.remoteAddress || "unknown");
    if (!withinRate(who)) {
      res
        .status(429)
        .type("html")
        .send(page("That is a lot of sign-ups", "Try again in a little while."));
      return;
    }

    // Logged either way: the log is the list until there is a list.
    logger.info({ address }, "Waiting list sign-up");
    await tell(address);

    res
      .status(200)
      .type("html")
      .send(
        page(
          "You are on the list",
          "We will write to " +
            escapeHtml(address) +
            " the day Baketly is ready, and not about anything else.",
        ),
      );
  },
);

export default router;
