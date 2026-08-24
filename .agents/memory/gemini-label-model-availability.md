---
name: Gemini label model availability
description: Live Gemini model availability constraint for the ingredient label scanner.
---

Use the current Gemini Flash model accepted by the configured API key for label scanning; the live API may retire a previously supported model for new keys.

**Why:** The label scanner's configured Gemini key rejected Gemini 2.5 Flash and explicitly directed the integration to Gemini 3.6 Flash. A working key does not guarantee access to every published model name.

**How to apply:** When changing the scanner model or investigating provider 404 responses, trust the provider's model-availability message, update only the server-side model name, and re-run an end-to-end image scan. Keep the key in `GEMINI_API_KEY` and never expose it to the browser.