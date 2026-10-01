// The receipt a customer is handed after they pay.
//
// Unlike a baker's message to us, nothing about this is best effort. A contact
// message is written to the database first, so a mail provider being down
// costs nothing; a receipt is not stored anywhere, so if the send fails the
// customer simply never gets it. The baker is standing at a market stall with
// the customer in front of them, and needs to know within a second whether to
// say "it's on its way" or to offer to write it down.
//
// So this reports what happened, in words the baker can act on, and the screen
// says only what is true.

import { logger } from "./logger";

const ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8_000;

export interface ReceiptLine {
  name: string;
  quantity: number;
  price: number;
}

export interface Receipt {
  to: string;
  bakeryName: string;
  total: number;
  currency: string;
  /** "Cash" or "Card", as the till recorded it */
  method: string;
  lines: ReceiptLine[];
  soldAt: string;
}

export type ReceiptResult = { ok: true } | { ok: false; reason: string };

/**
 * Who a receipt comes from.
 *
 * This one matters more than the contact form's sender. Resend's shared
 * onboarding@resend.dev address may only send to the account's own address,
 * which is fine for a form that emails us and useless for a receipt going to a
 * customer. A receipt needs a verified domain, so this is deliberately its own
 * setting rather than sharing CONTACT_EMAIL_FROM.
 */
function sender(): string {
  return process.env.RECEIPT_EMAIL_FROM || process.env.CONTACT_EMAIL_FROM || "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "ILS" ? "₪" : "";
  const figure = amount.toFixed(2);
  return symbol ? symbol + figure : figure + " " + currency;
}

function soldOnLabel(soldAt: string): string {
  const when = new Date(soldAt);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function receiptHtml(receipt: Receipt): string {
  const rows = receipt.lines
    .map((line) => {
      const each = line.quantity > 1 ? ` <span style="color:#6b665c">(${money(line.price, receipt.currency)} each)</span>` : "";
      return (
        '<tr><td style="padding:7px 0;border-bottom:1px solid #eae5db">' +
        `${escapeHtml(line.name)}${line.quantity > 1 ? " × " + line.quantity : ""}${each}` +
        '</td><td style="padding:7px 0;border-bottom:1px solid #eae5db;text-align:right;white-space:nowrap">' +
        money(line.price * line.quantity, receipt.currency) +
        "</td></tr>"
      );
    })
    .join("");

  const on = soldOnLabel(receipt.soldAt);
  // A typed-amount sale has nothing to list, so the total stands alone rather
  // than under an empty table.
  const body =
    receipt.lines.length === 0
      ? '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
        '<tr><td style="padding:7px 0;font-weight:600">Total</td>' +
        `<td style="padding:7px 0;text-align:right;font-weight:600">${money(receipt.total, receipt.currency)}</td></tr></table>`
      : '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
        rows +
        '<tr><td style="padding:12px 0 0;font-weight:600">Total</td>' +
        `<td style="padding:12px 0 0;text-align:right;font-weight:600">${money(receipt.total, receipt.currency)}</td></tr></table>`;

  return (
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:15px;color:#22201c;max-width:420px">' +
    `<h2 style="margin:0 0 2px;font-size:20px">${escapeHtml(receipt.bakeryName)}</h2>` +
    `<p style="margin:0 0 18px;color:#6b665c;font-size:13px">Receipt${on ? " · " + escapeHtml(on) : ""}</p>` +
    body +
    `<p style="margin:16px 0 0;color:#6b665c;font-size:13px">Paid by ${escapeHtml(receipt.method.toLowerCase())}</p>` +
    '<p style="margin:22px 0 0;font-size:13px">Thank you — see you next time.</p>' +
    "</div>"
  );
}

export function receiptText(receipt: Receipt): string {
  const on = soldOnLabel(receipt.soldAt);
  const lines = receipt.lines
    .map(
      (line) =>
        `${line.name}${line.quantity > 1 ? " x" + line.quantity : ""}  ${money(line.price * line.quantity, receipt.currency)}`,
    )
    .join("\n");
  return (
    `${receipt.bakeryName}\nReceipt${on ? " - " + on : ""}\n\n` +
    (lines ? `${lines}\n\n` : "") +
    `Total  ${money(receipt.total, receipt.currency)}\n` +
    `Paid by ${receipt.method.toLowerCase()}\n\nThank you - see you next time.`
  );
}

/**
 * Send it, and say what happened.
 *
 * Never throws: the caller turns the reason into a line on the till screen.
 */
export async function emailReceipt(receipt: Receipt): Promise<ReceiptResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.error({ to: receipt.to }, "Receipt not sent: RESEND_API_KEY is not set");
    return { ok: false, reason: "Email receipts are not set up yet." };
  }
  const from = sender();
  if (!from) {
    logger.error({ to: receipt.to }, "Receipt not sent: RECEIPT_EMAIL_FROM is not set");
    return { ok: false, reason: "Email receipts are not set up yet." };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [receipt.to],
        subject: `Your receipt from ${receipt.bakeryName}`,
        html: receiptHtml(receipt),
        text: receiptText(receipt),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error(
        { status: response.status, detail: detail.slice(0, 400) },
        "Mail provider refused a receipt",
      );
      // 403 here is nearly always the same thing: a sender that has not been
      // verified for this domain, which Resend limits to the account's own
      // address. Worth saying plainly rather than "something went wrong".
      return {
        ok: false,
        reason:
          response.status === 403
            ? "Baketly cannot send to that address yet — the sending domain is not verified."
            : "The email could not be sent just now.",
      };
    }

    logger.info({ total: receipt.total, lines: receipt.lines.length }, "Receipt emailed");
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Could not email a receipt");
    return { ok: false, reason: "The email could not be sent just now." };
  }
}
