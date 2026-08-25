---
name: Gemini label model availability
description: Live Gemini model availability constraint for the label scanner and Ask Baketly.
---

Do not hard-code a single Gemini model. Both features walk an ordered list and
fall through on provider failures only (403, 404, 429, 5xx, network, timeout).

**Model availability on this key, checked 2026-08-25 against the live API:**

- `gemini-flash-lite-latest` — works, first choice, answers a label scan in ~1.6s
- `gemini-2.5-flash-lite` — in the chain, rarely reached
- `gemini-3.6-flash` — works
- `gemini-flash-latest` — works, but has returned 503 "high demand"
- `gemini-2.5-flash` — **retired**. Returns 404: "no longer available to new
  users. Please update your code to use models/gemini-3.6-flash"

**A correction worth keeping.** An earlier version of this note said the key
required "Gemini 3.6 Flash". That was then overwritten with a note calling it
wrong, because the code was calling `gemini-3.6-flash` while the scanner was
broken and flash-lite worked once the chain was added. The overwrite was the
mistake: `gemini-3.6-flash` is real and does work here. The original scanner
failure had a different cause. Do not remove `gemini-3.6-flash` from the chain
on the assumption it does not exist.

**How to apply:** change the ordering in `GEMINI_MODELS` rather than replacing
the list with one name, and check a model against the live API before deciding
it is unavailable. The server logs which model answered. Keep the key in
`GEMINI_API_KEY` and never expose it to the browser.
