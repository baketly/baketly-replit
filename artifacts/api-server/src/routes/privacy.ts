// The privacy policy as a public page.
//
// Apple asks for a URL anyone can open without the app, and this is it. What
// it says is not written here: the text lives in @workspace/policy and the app
// shows the same words on a screen of its own, because two copies of a policy
// is two policies, and the one nobody edits becomes a promise the app no
// longer keeps.
//
// Hosted by the API rather than on a separate site so the URL exists as soon
// as the server is deployed, and can never drift out of step with what the app
// does.

import { Router, type IRouter, type Request, type Response } from "express";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED, policyContact } from "@workspace/policy";

const router: IRouter = Router();

const CONTACT = process.env.PRIVACY_CONTACT_EMAIL || policyContact();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sectionHtml(): string {
  return PRIVACY_SECTIONS.map((section) => {
    const parts: string[] = [];
    if (section.heading) parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    if (section.bullets?.length) {
      parts.push(
        "<ul>" +
          section.bullets
            .map(
              (bullet) =>
                `<li><strong>${escapeHtml(bullet.lead)}</strong> ${escapeHtml(bullet.text)}</li>`,
            )
            .join("") +
          "</ul>",
      );
    }
    for (const paragraph of section.paragraphs ?? []) {
      parts.push(`<p>${escapeHtml(paragraph)}</p>`);
    }
    return parts.join("\n");
  }).join("\n\n");
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Baketly — Privacy</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0 auto; padding: 32px 22px 64px; max-width: 680px;
    font: 16px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #1e1b16; background: #faf6f0;
  }
  h1 { font-size: 27px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 30px 0 8px; }
  p, li { color: #3a352c; }
  li { margin-bottom: 6px; }
  .updated { color: #8a8578; font-size: 13px; margin: 0 0 26px; }
  a { color: #5e6d31; }
</style>
</head>
<body>
<h1>Baketly privacy policy</h1>
<p class="updated">Last updated ${PRIVACY_UPDATED}</p>

${sectionHtml()}

<h2>Getting in touch</h2>
<p>Questions, or a request about your data: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
</body>
</html>
`;

router.get("/privacy", (_req: Request, res: Response) => {
  res.type("html").send(page);
});

export default router;
