// Putting a baker's message in front of a person.
//
// The row in the database is the record and is written first; this is the
// nudge that says a row is waiting. So sending is best effort: a provider that
// is down, misconfigured, or not set up at all must never turn a message a
// baker wrote into an error on their screen — the message is already kept.
//
// Resend is used over SMTP because it is one HTTPS call with one secret, and
// SMTP credentials on a container that sleeps and wakes are a support problem
// nobody needs. Reply-to is the baker, so answering is a reply and not a
// copy-paste of an address out of the body.

import { logger } from "./logger";

const ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8_000;

/** Where the messages land. */
function inbox(): string {
  return process.env.CONTACT_EMAIL_TO || "contact@baketly.com";
}

/**
 * Who they come from.
 *
 * Resend's shared sender works without owning a domain, which is what makes
 * this usable the day the key is set; a verified baketly.com sender is a
 * change of one environment variable later.
 */
function sender(): string {
  return process.env.CONTACT_EMAIL_FROM || "Baketly <onboarding@resend.dev>";
}

const TOPIC_WORDS: Record<string, string> = {
  suggestion: "Suggestion",
  problem: "Not working",
  question: "Question",
  other: "Message",
};

export interface ContactEmail {
  id: string;
  email: string;
  topic: string;
  subject: string;
  body: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asHtml(message: ContactEmail): string {
  const paragraphs = message.body
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return (
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:15px;color:#22201c">' +
    `<p style="margin:0 0 4px;color:#6b665c;font-size:13px">${escapeHtml(TOPIC_WORDS[message.topic] || "Message")}` +
    ` · from ${escapeHtml(message.email)}</p>` +
    `<h2 style="margin:0 0 16px;font-size:19px">${escapeHtml(message.subject)}</h2>` +
    paragraphs +
    `<p style="margin:22px 0 0;color:#6b665c;font-size:12px">${escapeHtml(message.id)}</p>` +
    "</div>"
  );
}

/**
 * Hand the message to the provider.
 *
 * Resolves either way. The caller has already answered the baker.
 */
export async function emailContactMessage(message: ContactEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // not an error: a deployment without a mail key keeps the messages in the
    // database, where the admin route reads them
    logger.info({ messageId: message.id }, "No RESEND_API_KEY; message kept in the database only");
    return false;
  }

  const stopWaiting = AbortSignal.timeout(SEND_TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender(),
        to: [inbox()],
        reply_to: message.email,
        subject: `[${TOPIC_WORDS[message.topic] || "Message"}] ${message.subject}`,
        html: asHtml(message),
        text: `${TOPIC_WORDS[message.topic] || "Message"} from ${message.email}\n\n${message.subject}\n\n${message.body}\n\n${message.id}`,
      }),
      signal: stopWaiting,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error(
        { messageId: message.id, status: response.status, detail: detail.slice(0, 400) },
        "Mail provider refused a baker's message",
      );
      return false;
    }
    logger.info({ messageId: message.id, to: inbox() }, "Message emailed");
    return true;
  } catch (error) {
    logger.error({ messageId: message.id, err: error }, "Could not email a baker's message");
    return false;
  }
}
