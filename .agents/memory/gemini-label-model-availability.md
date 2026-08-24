---
name: Gemini label model availability
description: Live Gemini model availability constraint for the ingredient label scanner.
---

Do not hard-code a single Gemini model for label scanning. The scanner tries an
ordered list of Flash models and falls through to the next one on provider-level
failures only (403, 404, 429, 5xx, network error, per-attempt timeout).

**Why:** An earlier note here claimed the configured key rejected Gemini 2.5 Flash
and mandated a "Gemini 3.6 Flash" model. No such model is served by the Generative
Language API, so every scan failed the provider call and returned the generic
manual-entry error. That note was wrong, and a single hard-coded model name is
what let one wrong belief break the whole feature.

Verified 2026-08-24 against the live API with the project key: an end-to-end scan
of a Hebrew nutrition label succeeded on `gemini-flash-lite-latest`, first
attempt, in ~1.6s, extracting product name, package size and unit, and all five
macros. The later candidates were never reached, so their availability on this
key is untested.

**How to apply:** Change the ordering in `LABEL_MODELS` rather than replacing the
list with one name. A response that parses but carries no usable label data is a
real answer, not a provider fault, and must return 422 without consuming the rest
of the chain. Keep the key in `GEMINI_API_KEY`; never expose it to the browser.
The server logs `Gemini label model responded` with the model that answered, which
is the fastest way to see what the key can actually reach.
