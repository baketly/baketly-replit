# Running Baketly outside the phone

Written 6 October 2026 from a cloud session, then corrected on the Mac once
each step had actually been run there.

**Option A runs anywhere, including a cloud container.** An earlier draft of
this file claimed the opposite -- that the nearby-bakery search needed a
machine with unrestricted outbound, because it reads whichever bakery
websites it discovers and no allow-list can name those in advance. That is
wrong, and the mistake is worth keeping here so nobody repeats it: the
browser never fetches a bakery site. The server does, in
`artifacts/api-server/src/lib/market/scan/fetch.ts`. Pointed at the live
deployment, the client talks to exactly one host and Replit does all the
reaching out, with its own keys and its own open network:

```
browser -> baketly-app.replit.app -> Gemini, Google Places, bakery websites
```

So a cloud container needs `baketly-app.replit.app` allowed and nothing
else. Only Option B -- running the API server locally -- needs open outbound,
because then this machine is the one doing the fetching.

What still genuinely needs the Mac: archiving in Xcode, the camera, and the
screen recording.

---

## Option A — point the client at the live server (works anywhere)

Fastest. No database, no keys. Everything works because the live Replit
server already holds `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY` and
`RESEND_API_KEY`, and has open outbound network.

First, find the project root. It is not necessarily under your own home
directory: on the Mac this was written against, the working clone lives under
a second account, at `/Users/michalelyasaf/baketly-replit`. Search `/Users`,
not `~`:

```bash
find /Users -maxdepth 6 -name pnpm-workspace.yaml -not -path "*/node_modules/*" 2>/dev/null
```

A fresh `git clone` under your own account works just as well for running the
app. The only thing that needs the original clone is archiving in Xcode,
where the signing setup lives.

Then, chained so that nothing runs in the wrong directory if a step fails:

```bash
cd <the directory that printed> && git log -1 --oneline
pnpm install && cd artifacts/claude-design && \
  API_PROXY_TARGET=https://baketly-app.replit.app pnpm dev
```

Open `http://localhost:5173/?native=1`.

Why this gets past CORS: the live server allows only `capacitor://localhost`
and `ionic://localhost` (`artifacts/api-server/src/app.ts`), so a browser
pointed straight at it is refused. The Vite proxy makes the request
server-side instead, so the browser only ever talks to localhost and CORS
never applies.

**Caveats**

- It uses the **live database**. Sign up a throwaway account. Leave
  `review@baketly.com` alone — reviewers come back to it.
- **Required, not optional.** `vite.config.ts` ships `changeOrigin: false`,
  which forwards `Host: localhost:5173` upstream. Replit routes by Host,
  cannot match that, and every `/api` call returns empty — the login screen
  renders but no server-backed control appears. Set it to `true` first:

  ```bash
  sed -i '' 's/changeOrigin: false/changeOrigin: true/' vite.config.ts
  ```

  (`-i ''` is required on macOS.) Vite restarts itself on a config change.
  Confirm with `curl -s http://localhost:5173/api/healthz` before opening the
  page. `false` is correct for the local target the comment in that file
  describes; it only breaks against a remote one.

---

## Option B — the full local stack

Isolated from production. Needs Postgres and your own keys. Every command
below was run and verified in the cloud container.

### 1. Postgres

```bash
brew install postgresql@16
brew services start postgresql@16
createdb baketly
```

### 2. Schema

```bash
cd <project root>
pnpm install
DATABASE_URL="postgres://$(whoami)@127.0.0.1:5432/baketly" \
  pnpm --filter @workspace/db run push
```

Creates 8 tables: bakeries, competitor_price_history, competitor_products,
competitor_scans, messages, sessions, users, workspace_state.

### 3. API server

```bash
cd <project root>/artifacts/api-server
pnpm run build

export DATABASE_URL="postgres://$(whoami)@127.0.0.1:5432/baketly"
export PORT=5000
export NODE_ENV=development
export SESSION_SECRET="$(head -c 32 /dev/urandom | base64)"
export GEMINI_API_KEY=...            # Ask Baketly, label scanner, market check wording
export GOOGLE_PLACES_API_KEY=...     # better bakery discovery; falls back to OSM
export RESEND_API_KEY=...            # emailed receipts
export RECEIPT_EMAIL_FROM=...
node --enable-source-maps ./dist/index.mjs
```

Health check is `/api/healthz` — **not** `/api/health`, which 404s.

Never set `AUTH_DEV_STORE`. With a real database you do not need it.

### 4. The app

```bash
cd <project root>/artifacts/claude-design
API_PROXY_TARGET=http://127.0.0.1:5000 PORT=5173 pnpm dev
```

Open `http://localhost:5173/?native=1`. The `?native=1` unwraps the iPhone
picture and applies the safe-area insets, matching the native build.

---

## The path is not what the handover says

`HANDOVER.md` opens its Mac recipe with `cd ~/baketly-replit`. On at least one
Mac that directory does not exist, and because the commands were pasted as a
block rather than chained, the failed `cd` was ignored and every later command
ran in the home directory: `pnpm install` installed nothing useful, and
`pnpm dev` reported `Command "dev" not found`. None of that was a real
failure. Find the root first, and chain the steps with `&&` so a bad `cd`
stops the chain.

Also, do not run the handover's `git checkout -- .` before checking
`git status`. That line was written when the Mac only pulled and built, so
the only changes it could discard were `cap sync` and `pod install` churn.
On a Mac that also edits, it destroys uncommitted work.

---

## Things that cost time today

**The auth rate limit.** `/auth/signup` and `/auth/login` share one counter:
10 attempts per 15 minutes per IP, held in an in-memory Map
(`artifacts/api-server/src/routes/auth.ts:22`). Driving the app repeatedly
trips it and the symptom is misleading — the login card simply stays up and
an overlay appears to swallow taps. Restarting the API server clears it
instantly; there is no need to wait out the window.

**`innerText` lies in this app.** The runtime replaces the whole `<html>`
element, so unpainted markup still reports in `document.body.innerText`. A
text snapshot returned the onboarding copy while the screen showed the login
card. Assert against screenshots, not text.

**Selectors are not what you would guess.** Several controls are not the
elements their appearance suggests:

| Control | Actual selector |
|---|---|
| Analytics tabs | `div.an-tab` — not buttons |
| Till quantity, first add | `button[aria-label="Add one"]` |
| Till quantity, after that | `button[aria-label="More"]` / `"Less"` |
| Recipe edit / delete | `button[aria-label="Edit recipe"]` / `"Delete recipe"` |
| Recipe price field | `input[inputmode="decimal"]` |
| Chat send | `button[aria-label="Send"]` — no text |
| Chat mic | `button[aria-label="Speak your question"]` |
| Event name field | plain `input` with **no** `type` attribute, so `input[type="text"]` never matches |

**Buttons relabel themselves.** "Save recipe" becomes "Save changes" in the
edit view; "Select recipes" becomes "Add 1 product" once something is ticked.
Exact-text matching breaks on both.

---

## What was verified, and what was not

Verified against a real Postgres and the real API:

- All four post-build-3 Recipes fixes, including the saved-recipe price
  change persisting to the database as `"price": 23`
- The till: $46 charged, $50 tendered, $4.00 change, cash recorded,
  receipt box; "Card · coming soon"
- Analytics: the till sale flowing through to Revenue, Items sold, the
  Products pie and "best earner"
- The market planner: name, date, booth fee, recipe picker, lineup, and the
  live Units / Revenue / Cost / Profit / Margin tiles
- Pantry, Settings, privacy policy, login and sign-up screens
- Zero `{{ }}` in the rendered DOM on every screen reached, zero page errors

Verified afterwards on the Mac, against the live server:

- **Apple and Google sign-in.** `/api/auth/apple/available` and
  `/api/auth/google/available` both return `{"available":true}` on the
  deployment, and "Continue with Google" and "Continue with Apple" both
  render on the login screen. Guideline 4.8 is satisfied on the build Apple
  will review.

Not verified by anything yet. All four are reachable through Option A, from
a Mac or a cloud container alike, because the live server answers them:

- **Ask Baketly's actual answers** — the path works and degrades to a plain
  sentence when no key is configured, but no real answer has been seen
- **The nearby-bakery search** — never run; the live server has the keys and
  the network for it
- **Emailed receipts** — never sent; the live server holds the Resend key
- **The nutrition label scanner** — needs a photograph as well, so a real
  camera on the Mac or a file fed to the picker

Still needing the Mac specifically:

- **Archiving build 3** in Xcode, where the signing setup lives
- **The screen recording** for Apple, on a real phone
- **Account deletion** — not run here, since confirming would have destroyed
  the test account; it is step 3 of the recording script anyway
