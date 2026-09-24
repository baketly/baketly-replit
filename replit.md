# Baketly

Baketly tells a home baker what each bake actually costs and what it earns: a
pantry priced per gram, recipes costed from it, markets planned and sold from a
phone till, and the numbers that come out the other end. It is also an iOS app —
the same interface, wrapped with Capacitor.

## Working agreements

Read these before changing anything. They are the owner's standing instructions,
not suggestions.

- **Surgical changes only.** Fix the thing asked for. Do not refactor, restyle
  or "modernize" code you were not asked about, and never break a working
  feature to improve an unrelated one.
- **Check the app still loads after every change.** A white screen or a freeze
  is a failure even if the build passed.
- **Never call an AI provider from the frontend.** Every Gemini call goes
  through the API server, which holds the key.
- **Keys live in Secrets** — never in a file, never in a chat message, never
  printed back to the user.
- **No `{{ }}` placeholder may ever reach the screen.** If a template binding
  cannot be resolved, render a real fallback.
- **Prefer robust rendering to another string patch.** A transform turning into
  a pile of special cases is a sign the approach is wrong.
- **One commit per change**, with a message that says why rather than what.

## Run & operate

- `pnpm install` — workspace install (pnpm only; npm and yarn are refused)
- `pnpm run typecheck` — full typecheck across every package
- `pnpm run build` — typecheck, then build every package
- `pnpm --filter @workspace/api-server run dev` — the API
- `pnpm --filter @workspace/api-server run test` — the API's tests
- `pnpm --filter @workspace/claude-design run dev` — the app
- `pnpm --filter @workspace/db run push` — create or update tables from the
  Drizzle schema; run after any schema change
- `node artifacts/claude-design/scripts/make-icons.mjs` — redraw every icon and
  splash from the one mark, including into the Xcode project

## Environment

| Variable | |
|---|---|
| `DATABASE_URL` | Required. Set by Replit when the database is created. |
| `SESSION_SECRET` | Required. Signs the session cookie; the server refuses to start in production without it. |
| `GEMINI_API_KEY` | Required by Ask Baketly, label scanning, and the wording of the market check. Everything else works without it. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Optional, all three or none. Google sign-in; the button hides itself when unset. |
| `GOOGLE_PLACES_API_KEY` | Optional. Better bakery discovery; falls back to OpenStreetMap. |
| `PRIVACY_CONTACT_EMAIL` | Optional. Shown on `/api/privacy`. |
| `AUTH_DEV_STORE` | **Never set this anywhere.** It swaps the database for throwaway in-memory accounts, and the server deliberately refuses to start in production if it is set. |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, bundled with esbuild
- DB: PostgreSQL + Drizzle ORM; validation with Zod and `drizzle-zod`
- App: Vite, served static
- iOS: Capacitor 7

## Where things live

- `artifacts/api-server` — the API, mounted at `/api`. Routes in `src/routes`,
  everything they lean on in `src/lib`.
- `artifacts/claude-design` — the app. `index.html` is a **generated** 1.5 MB
  single-line document; the `src/*-template.ts` modules patch it at load time.
- `artifacts/claude-design/ios` — the Capacitor project. Bundle id
  `com.baketly.app`.
- `artifacts/mockup-sandbox` — the design canvas. Not part of the product.
- `lib/db/src/schema` — the source of truth for every table.
- Each package's `.replit-artifact/artifact.toml` says how it is served: the app
  at `/`, the API at `/api`.

## Architecture decisions

- **The interface is generated, not authored.** `index.html` is patched by exact
  string replacement in the `*-template.ts` modules, chained in `src/main.tsx`.
  Every transform asserts its anchor appears exactly once and throws otherwise —
  a silent no-op is far worse than a loud failure. Do not hand-edit
  `index.html`; change the transform.
- **Injected controllers cannot import anything.** They are source text inside a
  template literal, so they reach app code through `window.__baketly*` globals.
  A backslash escape written there collapses — `\s` becomes `s` — so build
  regexes with care.
- **The workspace is saved whole**, validated by a strict Zod schema. An unknown
  key rejects the entire save with a 400, so a new field needs the schema
  changed and the API rebuilt.
- **Sessions are both a cookie and a bearer token.** The web app uses the
  cookie; the iOS app has no cookie across origins and sends the token. A
  request may carry both, and each is tried in turn.
- **Reminders are scheduled on the phone.** The server works out what is due and
  when; the phone raises it. No push service and nothing to keep awake between
  visits, which is why Autoscale is the right deployment.
- **The app fills the screen only when it is the app.** The generated page draws
  itself inside a picture of an iPhone; `fillTheScreen` in `layout-template.ts`
  unwraps that for the native build and applies the safe-area insets. `?native=1`
  shows the same thing in a browser.

## Gotchas

- Changing a transform's anchor string strands it. If a screen suddenly renders
  raw `{{ }}`, a patch stopped matching.
- After changing the Drizzle schema, run the db push, or the deployed API
  queries columns that do not exist.
- The iOS build needs the API's address baked in —
  `VITE_API_BASE=https://…` in front of the app's build, then
  `npx cap sync ios`. Without it every request inside the app goes nowhere.
- `GOOGLE_REDIRECT_URI` must match the Google Cloud entry character for
  character, and it changes whenever the deployment URL does.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and
  package details
