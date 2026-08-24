---
name: Photo storage boundary
description: Temporary access model for ingredient and packaging photos before customer accounts.
---

Ingredient and packaging photos use a temporary public single-user storage boundary. Uploads are server-mediated and bounded so only verified image bytes are written; public reads are limited to verified photo objects. When customer accounts are introduced, require authenticated upload issuance and protect stored photo reads with ownership-based ACL checks.

**Why:** The user selected the simpler public route while there is no login, but explicitly intends private per-customer photo storage later.

**How to apply:** Preserve photo references on the ingredient and packaging records during the migration; replace anonymous upload and read access at the storage boundary rather than changing the editor experience.