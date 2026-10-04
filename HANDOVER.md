# Where Baketly is, for picking the work up elsewhere

Written 4 October 2026, moving from the Windows machine to the Mac. A Claude
Code conversation lives on the computer it ran on, so this is the part worth
carrying: what is done, what is waiting, and the handful of rules that are not
guessable from the code.

## The app, in one line

A costing and pricing tool for home bakers who sell at markets. A generated
page (`artifacts/claude-design/index.html`, 1.5 MB) is patched at runtime by
the modules in `artifacts/claude-design/src/*-template.ts`, wrapped for iOS
with Capacitor, and talks to an Express API in `artifacts/api-server`.

## Where the App Store submission stands

- **Version 1.0 has never been released.** It is the only version there will be
  until it is approved, which is why App Store Connect offers no way to add
  another.
- It was submitted, and Apple replied with **Guideline 2.1 – Information
  Needed**: a routine hold on new developer accounts asking for a screen
  recording and six written answers. Not a verdict on the app.
- **Build 2** is in TestFlight. **Build 3** is what the repo is set to now
  (`CURRENT_PROJECT_VERSION = 3`, `MARKETING_VERSION = 1.0`) and is the one to
  archive: it carries every fix listed below.
- The version string in Xcode must read exactly what App Store Connect shows
  for the version — `1.0`, not `1`. A build whose version string differs is
  never offered in that version's Build picker.

### What still has to happen

1. Rebuild and sync on the Mac, archive, upload build 3.
2. Attach build 3 to version 1.0.
3. Paste the reply (below) into **App Review Information → Notes**, with the
   demo account in its own two fields.
4. Record the video on the phone, on that build.
5. Reply in the Resolution Centre with the same text and the recording.
6. Add for Review → Submit.

The step-by-step version of this, with the recording script and the reply as a
copy button, is the guide artifact:
**https://claude.ai/artifact/8he2cdS8WYXyaY8eCa5LrE** (phase 7).

### Demo account

`review@baketly.com` / `12345678`. Loaded with a sample bakery. Reviewers come
back to it, so leave its data alone. The password is weak and worth changing
before submitting; it is typed into App Store Connect once.

## The rules of this workspace

- **Nothing is pushed unless asked, each time.** Commit per change, small and
  described.
- **Replit is published only when the server changed**, and only when asked.
  Everything in `artifacts/claude-design` reaches the phone through a rebuild
  instead.
- **Never call an AI provider from the front end.** Gemini is reached through
  the API server; keys live in Replit Secrets.
- **Never let `{{ }}` reach the screen.**
- Secrets are never pasted into chat. When a key is needed, ask Replit to open
  its own secret dialog.
- `AUTH_DEV_STORE` must never be set in production.

## The two machines

Source edits happened on Windows; the Mac only pulls, builds and archives. That
is why the Mac keeps hitting *"please commit your changes before you merge"* —
`cap sync` and `pod install` rewrite tracked files, and Xcode writes the project
file back from memory. **Close Xcode, then:**

```bash
cd ~/baketly-replit && git checkout -- . && git pull
cd artifacts/claude-design && VITE_API_BASE=https://baketly-app.replit.app pnpm --filter @workspace/claude-design run build && npx cap sync ios
```

Never set the build number by hand in Xcode: it comes from the repo, and typing
it there is what makes the next pull fight you.

## The server

Replit app `6670bc5a-68f6-4f11-b167-0af55fc0259c`, live at
`https://baketly-app.replit.app`. Publishing is: ask the Replit agent to fetch
and fast-forward to `origin/main` (it has needed asking twice before it took),
check the file you expect actually changed, then publish and poll the status.
A publish takes anywhere from five to forty minutes.

**The deployment must stay awake from submission to approval.** A sleeping
backend reads as a broken app and is a 2.1 rejection on its own.

## What changed since the submitted build

Newest first; `git log` has the full reasoning in each message.

| Commit | What |
|---|---|
| `3698690` | A new recipe starts in No group, not Treats |
| `fb2e460` | Recipe delete button back; tapping a number box puts the caret at the end |
| `9be2e3b` | Price box opens empty rather than `0.00`, so 17 does not become 0.0017 |
| `0138d88` | The price of a **saved** recipe can be changed at all |
| `f27613c` | Build 3, version pinned at 1.0 |
| `3b356e4` | The diagnostic build stamp removed from Settings |
| `16aad1d` | Privacy policy says what the chat sends to Gemini; review notes updated |
| `1168bd6` | Chat box stopped collapsing to measure; the chat holds its foot |
| `f3567f8` | Other costs read however the model sends them |
| `8627db3`…`a27cb3b` | A market they already have is changed, not opened again; costs beyond the booth fee |
| `87595ff`…`e50139e` | A follow-up changes the card on screen instead of making a second one |
| `bdfab93`…`75cf738` | "Which recipe did you mean?" asked with buttons; the chat box grows |
| `83b36ae`…`b51e905` | The microphone actually starts; the chat resets each time the app opens |
| `93d4175` | A market's date read as a local day, not midnight UTC |
| `4971077` | The home calendar scrolls, last week to two weeks out |

## Things worth knowing before changing the client

- The generated runtime draws the app by **replacing the whole `<html>`
  element**. An observer on `<html>` or `body` dies with it; watch `document`
  (see `day-strip.ts`, `chat-pop.ts`, `chat-grow.ts`).
- The injected controllers are **source text inside template literals**. No
  imports, no backticks — a backtick in a comment ends the literal and the app
  renders nothing. Reach app code through `window.__baketly*`.
- A patch whose anchor string is missing should **throw**, not no-op. A silent
  `.replace()` that stopped matching is how the recipe price field became
  uneditable without anyone noticing.
- The generated page carries **its own patches**, which run on the same markup.
  Replacing a block they also anchor on breaks them in places far away — that
  is what the "Till stock till photo: expected 1 anchor, found 2" error was.
- Heredocs and `node -e` mangle backslashes; edit files with regexes through an
  editor tool or a script file, not an inline shell string.

## The reply to Apple

367 words, under the 4,000-character Notes limit, answering all six of their
questions. The guide holds it with a copy button; it is also in `SUBMITTING.md`
under "If Apple asks for more information".
