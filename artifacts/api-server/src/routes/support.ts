// Where to get help, as a public page.
//
// Apple requires a support URL that anyone can open and that actually
// resolves, and a dead one is a rejection. baketly.com is a bought name with
// nothing serving it yet, so this lives beside the privacy policy for the same
// reason that one does: the URL exists the moment the server is deployed, and
// cannot fall out of step with the app.
//
// When baketly.com is hosted, this can point at it or be replaced by it.

import { Router, type IRouter, type Request, type Response } from "express";
import { policyContact } from "@workspace/policy";

const router: IRouter = Router();

const CONTACT = process.env.PRIVACY_CONTACT_EMAIL || policyContact();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Questions a baker actually arrives with, answered rather than deflected. */
const ANSWERS: Array<{ question: string; answer: string }> = [
  {
    question: "How do I get my prices in?",
    answer:
      "Pantry, then add an ingredient. Enter what a whole sack or packet costs and how much is in it, and Baketly works out the price of every gram. You can photograph a nutrition label instead of typing the figures.",
  },
  {
    question: "What does Baketly charge?",
    answer: "Nothing. There is no subscription and nothing to buy inside the app.",
  },
  {
    question: "Do my recipes leave my phone?",
    answer:
      "Your bakery is stored on your phone and in your account so it is there on your next visit. It is not sold, shared with advertisers, or used to train anything. The privacy policy says exactly what goes where.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "Settings, then Delete my account. It removes the account, the bakery and everything in it. There is no waiting period and nothing is kept.",
  },
  {
    question: "The prices from nearby bakeries look wrong, or there are none.",
    answer:
      "Baketly reads prices from other bakeries' own public websites. Many shops do not publish prices, or publish them in a way no reader can follow, so some towns return very little. Where that happens the app says so rather than guessing.",
  },
  {
    question: "Something is broken.",
    answer:
      "Tell us what you were doing when it happened and we will fix it. There is a contact form inside the app, on the home screen, or write to the address below.",
  },
];

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Baketly — Support</title>
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
  .lede { color: #8a8578; font-size: 13px; margin: 0 0 26px; }
  a { color: #5e6d31; }
  .write { margin-top: 36px; padding: 18px 20px; background: #fff;
           border: 1px solid #e4ded2; border-radius: 14px; }
  .write p { margin: 0; }
</style>
</head>
<body>
<h1>Baketly support</h1>
<p class="lede">Help with the app for home bakers and small bakeries.</p>

<p>Baketly works out what each bake costs to make, what it earns at a market,
and what nearby bakeries charge for the same thing.</p>

${ANSWERS.map(
  (entry) =>
    `<h2>${escapeHtml(entry.question)}</h2>\n<p>${escapeHtml(entry.answer)}</p>`,
).join("\n\n")}

<div class="write">
  <p>Anything else, or if one of these did not help: write to
  <a href="mailto:${CONTACT}">${CONTACT}</a> and a person will answer.</p>
</div>

<h2>Privacy</h2>
<p>What Baketly stores and what leaves your phone: <a href="/api/privacy">the privacy policy</a>.</p>
</body>
</html>
`;

router.get("/support", (_req: Request, res: Response) => {
  res.type("html").send(page);
});

export default router;
