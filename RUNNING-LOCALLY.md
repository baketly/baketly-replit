# Running Baketly on your own machine

Two halves have to be running for the app to do anything: the page, served by
Vite out of `artifacts/claude-design`, and the API in `artifacts/api-server`.
The page fetches `/api/*` on its own origin, and the Vite dev server does not
serve that — so something has to answer it.

Pointing at the deployed server is almost always the right answer, and the
rest of this is why.

## Against the deployed server

The deployment already holds the Gemini, Places and Resend keys and the
database, and it does its own outbound fetching, so your machine only needs to
reach one host.

```bash
cd artifacts/claude-design
sed -i 's/changeOrigin: false/changeOrigin: true/' vite.config.ts
API_PROXY_TARGET=https://baketly-app.replit.app pnpm dev
```

Then confirm the proxy is really reaching it:

```bash
curl -s http://localhost:5173/api/healthz
# {"status":"ok"}
```

**`changeOrigin` must be `true`.** Left `false`, Vite forwards `Host:
localhost`, Replit cannot route that to the deployment, and every `/api` call
comes back empty while the page carries on rendering. Nothing errors and
nothing looks broken — you get a working-looking app with no data in it, which
is a much worse hour than a blank screen would have been.

The flag is `false` in the committed config because that is right for the
local-API case below, where the Host header should be left alone. Make the
change when you need it and leave it out of commits.

## Against a local API

Only worth it when you are changing the server itself. It needs its own
environment — `DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY`,
`GOOGLE_PLACES_API_KEY`, `RESEND_API_KEY` and the OAuth pairs — and those live
in Replit Secrets, not in the repo. Without them the server starts and then
fails at the first request that needs one.

```bash
cd artifacts/api-server && PORT=5000 pnpm dev     # PORT is required, not defaulted
cd artifacts/claude-design
API_PROXY_TARGET=http://localhost:5000 pnpm dev   # changeOrigin stays false
```

`AUTH_DEV_STORE` must never be set against production data.

## The live database

There is one database and the deployed server is pointed at it, so anything
you do through the app while proxying to Replit is real.

- Sign up throwaway accounts. Do not use anyone's real one.
- **Leave `review@baketly.com` alone.** Apple's reviewers come back to it, and
  its sample bakery is what they see.
- `/auth/signup` and `/auth/login` share one limit: **10 attempts per 15
  minutes per IP**, counted in the server's memory. You cannot restart the
  deployment to clear it, so sign in once and keep the session rather than
  logging in from a fresh browser each time.

## Driving the real screens

Worth knowing before writing anything that clicks around the app:

- `document.body.innerText` lies here. The runtime draws the app by replacing
  the whole `<html>` element, and unpainted markup still reports in
  `innerText`. Assert against screenshots.
- Controls are rarely the element they look like. Analytics tabs are
  `div.an-tab`; the till uses `aria-label` `Add one`, `More` and `Less`;
  recipes use `Edit recipe` and `Delete recipe`; a price is
  `input[inputmode="decimal"]`; chat send is `aria-label="Send"` with no text;
  the event name field has no `type`. Home's tiles read as `Newingredient`,
  with no space, because the label wraps without one.
- Buttons rename themselves once they have something to do: `Save recipe`
  becomes `Save changes`, `Select recipes` becomes `Add 1 product`.
- Number boxes put the caret at the end on focus, so typing into one appends
  to the figure already there. Select all first.

## Building for the phone

That is a different job and a different machine; see `HANDOVER.md`. The short
version is that the app never uses this proxy — the API's address is baked in
at build time:

```bash
cd artifacts/claude-design
VITE_API_BASE=https://baketly-app.replit.app pnpm --filter @workspace/claude-design run build
npx cap sync ios
open ios/App/App.xcworkspace
```
