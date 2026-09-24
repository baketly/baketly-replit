// The privacy policy, served by the API.
//
// Apple asks for a public URL before an app goes on sale, and this is the
// honest version: the app sends photographs of labels to Google, sends speech
// to whichever service the phone uses to transcribe it, and keeps a baker's
// recipes and sales on a server. Saying so plainly is both the requirement and
// the decent thing.
//
// Hosted here rather than on a separate site so the URL exists as soon as the
// server is deployed, and can never drift out of step with what the app does.

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const CONTACT = process.env.PRIVACY_CONTACT_EMAIL || "contact@baketly.com";
const UPDATED = "24 September 2026";

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
<p class="updated">Last updated ${UPDATED}</p>

<p>Baketly is a tool for home bakers: it works out what a bake costs, what to charge for it, and what a market earned. This policy explains what it keeps, what leaves your phone, and how to get rid of all of it.</p>

<h2>What Baketly stores</h2>
<ul>
  <li><strong>Your account:</strong> your email address, and a password stored only as a cryptographic hash — nobody at Baketly can read it. If you sign in with Google, we store the identifier Google gives us, not your Google password.</li>
  <li><strong>Your bakery:</strong> ingredients and their prices, recipes, packaging, products, photos you add to recipes, sales, markets and their results, your to-do list, and your settings. This is yours, kept so it is there on your next visit.</li>
  <li><strong>Where you sell:</strong> the town or address you enter, used to find bakeries near you. Baketly does not track your location, and does not ask the phone for it.</li>
</ul>

<h2>What leaves your phone, and where it goes</h2>
<ul>
  <li><strong>Photographs of nutrition labels</strong> are sent to Google's Gemini API to be read. Google processes the image to return the text on it.</li>
  <li><strong>Questions you ask Baketly</strong> are sent to Google's Gemini API, together with the figures needed to answer them — for example a market's revenue and costs. Your full bakery is never sent.</li>
  <li><strong>Speech,</strong> when you use the microphone, is transcribed by the service your phone provides (Apple on iOS). Baketly receives only the resulting text.</li>
  <li><strong>Prices at nearby bakeries</strong> are read from those bakeries' own public websites. Nothing about you is sent to them.</li>
</ul>
<p>Baketly does not sell your data, does not share it with advertisers, and shows no advertising.</p>

<h2>Other bakeries' prices</h2>
<p>Baketly reads prices published on nearby bakeries' public websites to show how yours compare. Those prices are facts about shops, not about you, and are kept separately from your account.</p>

<h2>Deleting everything</h2>
<p>Open Settings, then Account, then <strong>Delete my account</strong>. That removes your account and everything in it — recipes, ingredients, sales, markets and prices — and it cannot be undone. You can also write to us and ask.</p>

<h2>Children</h2>
<p>Baketly is for people running a small baking business and is not directed at children under 13.</p>

<h2>Changes</h2>
<p>If this policy changes in a way that matters, the date above changes and the app will say so.</p>

<h2>Getting in touch</h2>
<p>Questions, or a request about your data: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
</body>
</html>
`;

router.get("/privacy", (_req: Request, res: Response) => {
  res.type("html").send(page);
});

export default router;
