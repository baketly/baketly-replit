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
- **Build 4 is uploaded** and is the one to submit: it carries every fix listed
  below. The repo is set to match (`CURRENT_PROJECT_VERSION = 4`,
  `MARKETING_VERSION = 1.0`). Build 2 is in TestFlight.
- It went up as 4 rather than 3 because Xcode's upload flow ticks **Manage
  Version and Build Number** by default, which bumps the build number when the
  one being uploaded already exists. It does this quietly. If a number ever
  jumps again, that is why, and the repo has to be brought up to match or the
  next archive collides and jumps again.
- The version string in Xcode must read exactly what App Store Connect shows
  for the version — `1.0`, not `1`. A build whose version string differs is
  never offered in that version's Build picker.

### What still has to happen

1. ~~Rebuild and sync, archive, upload.~~ Done — build 4 is uploaded.
2. Attach build 4 to version 1.0.
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

---

# The whole history

Every commit, oldest first, as `git log` has it. The headings are the shape of
the work rather than anything git knows about.

## The first day: taking the generated app apart

The app arrived as a Replit workspace around a generated mockup. These are the first repairs: real source instead of a base64 mirror, a label scanner that worked, analytics with the baker's own numbers behind the tiles, and Ask Baketly wired to Gemini.

*18 commits, 2026-08-24 to 2026-08-24*

- `398a5aa` 2026-08-24 — Initialize repository from Replit workspace
- `42da972` 2026-08-24 — Sync current Replit workspace
- `183edea` 2026-08-24 — Decode base64 mirror to real source
- `e73afd8` 2026-08-24 — Fix ingredient label scanning: replace dead model with a fallback chain
- `41a9905` 2026-08-24 — Let numeric ingredient and packaging fields accept a decimal point
- `386fa41` 2026-08-24 — Add an opt-in dev proxy for /api in the Vite config
- `29fcf72` 2026-08-24 — Correct the Gemini label model note with verified behaviour
- `0f3373c` 2026-08-24 — Remove ingredient and packaging photos, and the list-row badge
- `47a6f74` 2026-08-24 — Drop the photo endpoints from the API spec and regenerate clients
- `4b03283` 2026-08-24 — Hide deleted pantry items from the recipe pickers, and filter by category
- `79c280d` 2026-08-24 — Seed demo sales and market events so Analytics has something to show
- `95a3b36` 2026-08-24 — Add cost and items-sold breakdowns behind the Analytics tiles
- `72cab83` 2026-08-24 — Drill into a month from the revenue chart, and into a single event
- `505750c` 2026-08-24 — Give the breakdown screens real styling and a shared layout
- `c1f33a7` 2026-08-24 — Remove the cash tracker, and make past events real and clickable
- `709e7be` 2026-08-24 — Add a period jump to past events, and share one picker design
- `c88277b` 2026-08-24 — Connect Ask Baketly to Gemini, grounded in the baker's own numbers
- `a4c2e6c` 2026-08-24 — Let events carry costs beyond the booth fee, and report a month in full

## Late August: it becomes an application

Accounts, per-baker data, a market with a life of its own, the shopping list, the till. The point where every screen stopped being a drawing of an app and started reading from records.

*80 commits, 2026-08-25 to 2026-08-30*

- `c19f2e3` 2026-08-25 — One finding per reply, a getting-started chat, and tips that open it
- `c727814` 2026-08-25 — Collapse event costs behind a total, and move the editor to the bottom
- `3d1d869` 2026-08-25 — Add grounded local price research for the user's products
- `7b03e70` 2026-08-25 — Build the price watch: ingredient moves, their cost impact, and local prices
- `b0e83e5` 2026-08-25 — Show sell-through on a market, and open its costs collapsed
- `a2ff710` 2026-08-25 — Autocomplete the location, and name competitors with a link to each
- `49c84ef` 2026-08-25 — Let Ask Baketly answer about best sellers, and get the answer right
- `7d8a2bd` 2026-08-25 — Make the missing-location notice a way to set one
- `2d67bf0` 2026-08-25 — Show location suggestions, and let them be addresses
- `af411d3` 2026-08-25 — Drop the status and new-event pills from the event header
- `93cfb06` 2026-08-25 — Work target plans out in code, and fix the model chain that broke them
- `5d554a8` 2026-08-25 — Only the plus adds a unit on the new sale screen
- `d4177a4` 2026-08-25 — Add accounts: email and password, Google, and per-baker data
- `e0fd04e` 2026-08-25 — New accounts start empty, with sample data on request
- `d4dd295` 2026-08-25 — Show only saved pantry and packaging in the recipe pickers
- `a094606` 2026-08-25 — Compute the home screen from the baker's own records
- `649ba88` 2026-08-25 — Run setup once for a new baker and keep what it collects
- `9991cd1` 2026-08-25 — Make the currency setting actually apply
- `4729f89` 2026-08-25 — Give a market a life of its own: plan, save, complete, delete
- `b9d263b` 2026-08-25 — Match the recipe picker to the pantry one, and make the shopping list real
- `807df7b` 2026-08-25 — Let the shopping list be corrected, and say how many packages to buy
- `788e325` 2026-08-25 — Let a sale belong to a market
- `8f2a87e` 2026-08-25 — List single sales in the analytics overview
- `7d5bc70` 2026-08-25 — Record how a sale was paid for, and call it Card
- `9de576a` 2026-08-26 — Say how the month's orders split, and lead with products
- `af1462b` 2026-08-27 — Order the app the way the work happens
- `97f9418` 2026-08-27 — Explain Baketly before asking a new baker for anything
- `264342f` 2026-08-27 — Rebuild home as a greeting and a week, not a dashboard
- `1c5f212` 2026-08-27 — Match the date format, and swap the last quick action for New event
- `a8da6fb` 2026-08-27 — Read an ingredient before changing it
- `d102b42` 2026-08-27 — Read packaging and recipes before changing them
- `be0fd32` 2026-08-27 — Read a market before changing it
- `fbfc260` 2026-08-27 — Name the unit a cost is per, and finish a market from its preview
- `fd7d6b4` 2026-08-27 — Let a finished market be reopened
- `ef9f990` 2026-08-27 — Open a planned market from the calendar, not its breakdown
- `28c279e` 2026-08-27 — Remember what sold when a market is reopened
- `a021def` 2026-08-27 — Reopen a market straight into its planner
- `0f76d9c` 2026-08-27 — Land the undo on the step it undoes
- `eff3756` 2026-08-29 — Show macros as boxes everywhere, sugar among them
- `8501ec0` 2026-08-29 — Stop two-column forms overflowing the screen
- `d855a93` 2026-08-29 — Keep every screen one width, scrollbar or not
- `bc1b8cf` 2026-08-29 — Call the markets screen Markets
- `faeb99f` 2026-08-29 — Give a recipe the same shape read as written
- `19ecd57` 2026-08-29 — Drop the label above a recipe's name
- `8a199fe` 2026-08-29 — List only names when picking recipes for a market
- `28ca2d1` 2026-08-29 — Give a market the same shape read as written
- `b78d694` 2026-08-29 — Let a changed shopping amount be put back
- `6f4e582` 2026-08-29 — Keep the shopping amounts in a column
- `6d77e6b` 2026-08-29 — Show the revert button, and let a box be emptied
- `9743e70` 2026-08-29 — Count packs to a tenth, and show the revert only on a changed row
- `cf91369` 2026-08-29 — List a month's counter sales where the month is reported
- `27b459c` 2026-08-29 — Give each product a page of its own
- `aa0b37a` 2026-08-29 — Show the month as a pie, and open a product from its slice
- `a0ec7ae` 2026-08-29 — Let a slice say which product it is
- `76fa594` 2026-08-30 — Keep a lifted wedge whole, and let it only name itself
- `21411cf` 2026-08-30 — Say what to bake for the next market
- `730d9af` 2026-08-30 — Say what each ordering actually shows
- `d20089e` 2026-08-30 — Ring up a market from what you brought to it
- `cce6ff9` 2026-08-30 — Stay at the market until the tick says otherwise
- `9976ae9` 2026-08-30 — Carry on selling the way you already were
- `e9115ee` 2026-08-30 — Let a single sale be deleted from the month it is listed in
- `d1b833f` 2026-08-30 — Rename two recipe fields to say what they hold
- `6fc0222` 2026-08-30 — Cost the time a recipe takes
- `6f1b948` 2026-08-30 — Stop the margin card claiming labor is not set
- `c292b47` 2026-08-30 — Pull a product off the lineup
- `ffe8905` 2026-08-30 — Pull an ingredient off a recipe
- `4a4e0f8` 2026-08-30 — Keep the shopping list out of the market editor
- `4af9fcf` 2026-08-30 — Add a recipe calculator
- `cf6a008` 2026-08-30 — Move the lineup calculator to where the market is read
- `f3dbcb0` 2026-08-30 — Give the lineup calculators a column of their own
- `623982a` 2026-08-30 — Drop the per-unit line from the calculator
- `5541681` 2026-08-30 — Let the chat be spoken to, and stop suggesting what to say
- `bf72435` 2026-08-30 — Correct what the microphone comment claims
- `0ba78b5` 2026-08-30 — Ask the baker their name, and stop asking what they sell
- `fafafe4` 2026-08-30 — Put Settings into sections
- `e05a609` 2026-08-30 — Greet by first name, and drop the empty findings
- `5f6744c` 2026-08-30 — Keep the price check local, and match the kind not the name
- `171b028` 2026-08-30 — Stop one shop's price calling itself a local range
- `840a740` 2026-08-30 — Find the neighbours before pricing them
- `1aa2c04` 2026-08-30 — Ask the price check for a spread, not a line

## Early September: the numbers made honest

Costing a baker's hours, margins that say what they exclude, the price check against real bakeries nearby, and a long run of work on what Ask Baketly is allowed to claim.

*4 commits, 2026-09-13 to 2026-09-13*

- `a817381` 2026-09-13 — Let the project install on Windows
- `a648991` 2026-09-13 — Let the API server start locally without a database
- `ff2f74f` 2026-09-13 — Put Home to-dos on days, with their own dot in the week strip
- `8e3e0b0` 2026-09-13 — Open every new page scrolled to the top

## Late September: ready to be submitted

The native shell, Sign in with Apple, account deletion, the privacy policy in one place, reminders on the device, receipts by email — and the market scan rebuilt after an audit found it reading classes as cookies and boxes as singles.

*110 commits, 2026-09-16 to 2026-09-30*

- `f2aa611` 2026-09-16 — Show how many of each planned item are left at a market till
- `82bd91a` 2026-09-16 — Let large workspaces save
- `48e45d5` 2026-09-16 — Add a photo to each recipe, shown wherever its icon was
- `ec024a6` 2026-09-16 — Keep local .env files out of git
- `2d3c561` 2026-09-16 — Finishing a market from the till opens only the results step
- `0960877` 2026-09-16 — Cash tender: light only the tapped button, and say Change due on Exact
- `f1555fa` 2026-09-16 — Let the baker define recipe groups in Settings
- `0e1401c` 2026-09-16 — Recipe groups in Settings: only add and remove
- `35216ff` 2026-09-16 — Say 'You earned' instead of 'You kept'
- `39d930f` 2026-09-16 — Home: quick actions under the week, this month's numbers, next market countdown
- `a317d45` 2026-09-16 — Show the currency sign beside a market's booth fee while editing
- `f4ee24a` 2026-09-16 — Home: month numbers after To do, all quick actions on one row
- `5700673` 2026-09-21 — Competitor intelligence: schema, store interface, Postgres and JSON stores
- `683110c` 2026-09-21 — Market pipeline: discovery abstraction, page scanner, normalization, matching
- `f72dde9` 2026-09-21 — Market pipeline: read competitor websites for real products and prices
- `76c6df6` 2026-09-21 — Market pipeline: deterministic pricing, market maths, and the route
- `809d9ab` 2026-09-21 — Market check: show the comparison, and count one listing once
- `c5d9b52` 2026-09-21 — Market check: find more bakeries, and compare only like with like
- `8586fd2` 2026-09-21 — Market check: list the bakeries Baketly could not read, with their websites
- `4eceab7` 2026-09-21 — Ask Baketly: the bakery's numbers, worked out on the server
- `406abdb` 2026-09-21 — Ask Baketly: tools instead of one big prompt
- `10aa9d2` 2026-09-21 — Ask Baketly: the chat asks the server, and says what it looked at
- `8c65e4d` 2026-09-21 — Ask Baketly: tell what a product earned apart from what it costs to bake now
- `a507621` 2026-09-21 — Ask Baketly: specific market advice, and a follow-up that stays on subject
- `04e199b` 2026-09-22 — Reminders: work out what is due, and when, in the baker's own clock
- `dae26a4` 2026-09-22 — Settings cog matches its section, a spinner while a label is read, and clearer shopping copy
- `f8b502d` 2026-09-24 — Ready the app for a native shell: bearer sessions, CORS, and account deletion
- `107c3a5` 2026-09-24 — Native Google sign-in, and a privacy policy with a URL
- `59051ca` 2026-09-24 — Wrap Baketly in a native iOS shell
- `6ab5431` 2026-09-24 — Draw the app's icon from the mark it already wears
- `0b4d7b2` 2026-09-24 — Reminders on the lock screen, and a microphone that works in the app
- `a4db7f8` 2026-09-24 — Fill the phone's screen, and keep clear of its furniture
- `9743a45` 2026-09-24 — Do not let a stale cookie hide a good session token
- `9967d57` 2026-09-24 — Refuse to start in production without a session secret
- `45e0ac3` 2026-09-24 — Call the app's artifact Baketly
- `f41686e` 2026-09-24 — Write the project brief that was still a template
- `3c0ebc0` 2026-09-25 — Let the app be built on the Mac it ships from
- `74cd544` 2026-09-26 — Build for the iOS versions Xcode still supports
- `975185e` 2026-09-26 — Raise the pods past 14.0 as well, since Capacitor pins them there
- `e5f25c7` 2026-09-26 — Adopt the scene lifecycle iOS now requires
- `48fce68` 2026-09-26 — Stop iOS magnifying the app the first time a field is tapped
- `2a9fb74` 2026-09-27 — Wait for the workspace, and never save one that was not read
- `193fba9` 2026-09-27 — Bake a loaf while the app opens
- `96dddf7` 2026-09-27 — Wear the new mark
- `550884b` 2026-09-27 — Open on the mark, at the right size, with nothing raw showing
- `820e065` 2026-09-27 — Give the morning more room, and the week seven buttons
- `7bce8f1` 2026-09-28 — Lengthen the day buttons
- `85d116b` 2026-09-28 — Work the package size out from the servings, and stop there
- `d4ed15b` 2026-09-28 — Let every grid column shrink, not the ones already caught
- `80c7e33` 2026-09-28 — Find the neighbours again when the map service is slow
- `7601b95` 2026-09-28 — Name each bakery once in a comparison
- `e9eab65` 2026-09-28 — Swipe from the left edge to go back
- `d58a166` 2026-09-28 — Say that the bakery search is working
- `dc34178` 2026-09-28 — Stop iOS colouring the app's buttons blue
- `1f9fef6` 2026-09-28 — Open on the loaf alone, not the whole tile
- `b6f2cdd` 2026-09-28 — Fill the dropdowns the phone was leaving empty
- `07c5f80` 2026-09-28 — Back means the screen that opened this one
- `248ae3e` 2026-09-28 — Give the map time to answer, and judge what it says
- `9505914` 2026-09-28 — Delete the comment the new race made untrue
- `a8c398c` 2026-09-28 — Say which providers found the bakeries
- `9b45b00` 2026-09-28 — Put the morning on one ground, countdown included
- `8cb8c29` 2026-09-28 — Stop a half-finished completion hiding the save button
- `8dc2ee4` 2026-09-28 — Mark card payments coming soon, and stop offering them
- `b2f2992` 2026-09-28 — Make the green a welcome, and put the day below it
- `f31f53b` 2026-09-28 — Let a form control shrink wherever it sits
- `93e027f` 2026-09-28 — Keep enough of a photo to be worth looking at
- `c3c3048` 2026-09-28 — Two dozen currencies, in a dropdown, beside the hourly rate
- `13e08e2` 2026-09-28 — Open the till on cash, with no way back to card
- `fa06d45` 2026-09-28 — Give the date its own line on a phone
- `d510bd6` 2026-09-28 — Undo a completion straight into an editable market
- `0e3e244` 2026-09-29 — Take messages from bakers, and put them in front of a person
- `8e78833` 2026-09-29 — An envelope on the home screen, and a screen to write on
- `61119b5` 2026-09-29 — Let the row decide, not the breakpoint, whether date and fee share a line
- `c238d24` 2026-09-29 — Rebuild the login screen around the way people expect to sign in
- `b9cb1e3` 2026-09-29 — Sign in with Apple
- `0d735f3` 2026-09-29 — Send both providers through the system browser sheet
- `2950296` 2026-09-30 — Take Apple's key in whatever shape it arrives in
- `c83b220` 2026-09-30 — Welcome Back, and a rule that says the rest is another way in
- `a2509b7` 2026-09-30 — Show the login once, at the size it means to stay
- `8f3bb10` 2026-09-30 — A way back out of the privacy policy
- `ce050b5` 2026-09-30 — A website for baketly.com
- `9f5873c` 2026-09-30 — Put the date and the booth fee back on one line
- `1e4fe5e` 2026-09-30 — Say it the way a baker would say it
- `cef34a4` 2026-09-30 — A way out of a market that is not finishing it
- `056686d` 2026-09-30 — Shop for what is planned, not for a whole extra batch
- `608e44b` 2026-09-30 — One market's figures, not every market's, on one market's screen
- `f2c46df` 2026-09-30 — Give the bars a track to end against
- `bab94fa` 2026-09-30 — Remind a baker about the shopping, and land a tap where it belongs
- `025edb4` 2026-09-30 — Let the workspace hold the reminder settings the app now sends
- `85f0c76` 2026-09-30 — Make Ask Baketly answer the question, and stop calling free labour a margin
- `72803d0` 2026-09-30 — Take the microphone off the chat until it works
- `dd6f6a3` 2026-09-30 — Answer thin bakeries honestly, and stop answering questions that are not asked
- `0b85e44` 2026-09-30 — Give the agent the pantry, and one thing to do next
- `8bf3756` 2026-09-30 — An evaluation suite, so the prompt stops being held together by hope
- `64eed65` 2026-09-30 — Read the privacy policy inside Baketly, not on a website
- `1f805bc` 2026-09-30 — Cut seven rules the agent did not need
- `a5ac54b` 2026-09-30 — Find the bakeries that were there all along
- `2c45575` 2026-09-30 — One shop, one price, and nothing else on the line
- `3f67fd0` 2026-09-30 — Read a website however the map spelled it
- `0fb1e25` 2026-09-30 — Spend the slots on bakeries that can actually be priced
- `fb6ca93` 2026-09-30 — market: keep ice cream out of the bakery list without losing slots
- `8d9d99c` 2026-09-30 — market: say why a check came back empty in words that help
- `a79fcd0` 2026-09-30 — market: two lines on the search results that were not true
- `c1504fa` 2026-09-30 — market: do not say the same caveat twice under one product
- `c623940` 2026-09-30 — market: read the sentence the shop wrote under each product
- `2cb624b` 2026-09-30 — market: stop pricing a bake against a different bake
- `83eeca8` 2026-09-30 — market: two more things in the pool that were not products
- `09d0582` 2026-09-30 — market: read a loaf that is named like a loaf
- `a9902b1` 2026-09-30 — market: a menu's footnote marker is not part of the name
- `688c48b` 2026-09-30 — market: say each figure once per product

## October: review, and the chat that can do things

Submitted, held for information, and meanwhile: the scrolling calendar, the microphone, a chat that prepares changes on cards, and the recipe editor repairs that came out of testing it properly.

*75 commits, 2026-10-01 to 2026-10-04*

- `4ae1ce2` 2026-10-01 — receipts: actually send one
- `e656045` 2026-10-01 — receipts: email only, and a till that says what happened
- `43b03f5` 2026-10-01 — events: put the currency symbol inside the booth fee box
- `599b4de` 2026-10-01 — events: hold the date input inside its own column
- `30de095` 2026-10-01 — events: give the booth fee room by taking it from the date
- `3829305` 2026-10-01 — events: even columns and equal heights for the date and fee
- `da1604c` 2026-10-01 — events: let the date control say how wide it is
- `79eb9f9` 2026-10-01 — events: take the floor off the date column so auto can size it
- `3e16d64` 2026-10-01 — analytics: the tab is where a journey starts, not a step in one
- `a7ad1ed` 2026-10-01 — swipe: let the screen follow the finger
- `230f6a1` 2026-10-01 — events: back to the original row, with the date capped at 140px
- `8f511bc` 2026-10-01 — swipe: show the screen you are going back to while you go back to it
- `d026a3f` 2026-10-01 — swipe: step sideways between the Analytics tabs
- `d89da69` 2026-10-01 — events: a longer date box, and both boxes the same height
- `95ac7de` 2026-10-01 — swipe: no blank between tabs, and no dragging past the ends
- `25fd5e2` 2026-10-01 — swipe: both tabs move under the finger, the whole way
- `bac51cc` 2026-10-01 — analytics: the heading and the tabs stay; only the pane turns over
- `709e33b` 2026-10-01 — analytics: the tabs name themselves, so the panes need not
- `cca3533` 2026-10-01 — swipe: one swipe, one tab, at half a screen
- `9300220` 2026-10-01 — swipe: judge a flick on how it ended, not on its average
- `da73aaf` 2026-10-01 — home: the quick actions go back where they belong
- `e6ef97c` 2026-10-01 — privacy: let the policy be scrolled to its own top
- `4684e16` 2026-10-01 — privacy: one way back, not two
- `ed9bd23` 2026-10-01 — swipe: ask the page when the tab has changed, instead of assuming
- `3e85d20` 2026-10-01 — swipe: make the pane and the tab incapable of disagreeing
- `aa64c3c` 2026-10-01 — privacy: say that a receipt goes to a customer, and through whom
- `3498f56` 2026-10-01 — ios: stop asking for a microphone the app cannot use
- `8bff550` 2026-10-01 — ios: declare the export compliance answer in the app
- `63b2a34` 2026-10-01 — docs: what App Review asks for, and Baketly's answers
- `c08440d` 2026-10-01 — claude-design: make the typecheck check something
- `7d3d4b7` 2026-10-01 — privacy: drop the speech paragraph, since nothing speaks
- `4fb8585` 2026-10-01 — ios: ship for iPhone, not for iPad
- `aa406f7` 2026-10-01 — docs: the submission guide, in the order it has to be done
- `653f203` 2026-10-01 — support: a page the App Store's support URL can point at
- `3b8b24c` 2026-10-01 — site: send people to the App Store, not to a form that does nothing
- `489b6e7` 2026-10-01 — Revert "site: send people to the App Store, not to a form that does nothing"
- `b7e323d` 2026-10-01 — waitlist: make the sign-up form actually sign people up
- `0824b90` 2026-10-01 — docs: receipts can deliver, and the support URL is a real site
- `253966a` 2026-10-01 — receipts: a sale with a typed amount is still a sale
- `3d387c0` 2026-10-01 — receipts: itemise the basket the till actually keeps
- `5d27794` 2026-10-01 — swipe: a cancelled tab swipe no longer eats the next one
- `460d24f` 2026-10-02 — swipe: the pane moves with the finger, from the first pixel
- `1622129` 2026-10-02 — swipe: the tab mark moves when the content does, not before
- `d172dd8` 2026-10-02 — swipe: turn off changing tab by swiping on Analytics
- `4220761` 2026-10-02 — market: find the bread bakeries, and find them in a quarter of the time
- `9480d54` 2026-10-02 — market: the example row is the listing the range was built from
- `1be51a9` 2026-10-02 — market: what a six-town audit found, including Hebrew reading nothing
- `e4d79c4` 2026-10-02 — market: what the second audit found
- `cae4a52` 2026-10-02 — settings: take the sample-data buttons off the screen
- `c62fd60` 2026-10-02 — docs: the sample bakery is already on the review account
- `4971077` 2026-10-02 — home: the row of days scrolls, from last week to two weeks out
- `407a948` 2026-10-02 — ios: the microphone is back, and used
- `38ee293` 2026-10-02 — chat: it can set things up now, and a message rises into place
- `93d4175` 2026-10-02 — Market view: read the event's date as a local day
- `aa7b555` 2026-10-02 — Chat: one press to listen, Send stops and sends; confirm opens the item
- `83b36ae` 2026-10-03 — Mic: register the recogniser plugin instead of hoping it is on window
- `b51e905` 2026-10-03 — Chat: starts over on each open, and the box sits clear of the bubbles
- `dec8471` 2026-10-03 — Settings: show when the running bundle was built
- `bdfab93` 2026-10-03 — Chat: ask which recipe they meant, with a short list worth tapping
- `75cf738` 2026-10-03 — Chat: a box that grows, and the question answered by tapping
- `87595ff` 2026-10-03 — Chat: a follow-up changes the market on the card; saved markets can change too
- `e50139e` 2026-10-03 — Chat: cards keep their place, and a saved market opens with its change
- `8627db3` 2026-10-03 — Chat: a market they have is changed, not set up again; costs beyond the fee
- `a27cb3b` 2026-10-03 — Chat: "A new market" on the card, and other costs into the form
- `f3567f8` 2026-10-03 — Chat: other costs are read however the model sends them
- `1168bd6` 2026-10-03 — Chat: the box no longer collapses to measure, and the chat holds its foot
- `948f436` 2026-10-03 — SUBMITTING: the reply to "Information Needed", and what to record
- `16aad1d` 2026-10-03 — Privacy policy and review notes for the build with the chat in it
- `3b356e4` 2026-10-03 — Settings: the build stamp comes out again
- `f27613c` 2026-10-03 — ios: build 3, and the version stays 1.0
- `0138d88` 2026-10-03 — Recipes: the price can be changed on a recipe you have saved
- `9be2e3b` 2026-10-03 — Recipes: a price box you can type seventeen into
- `fb2e460` 2026-10-03 — Recipes: the minus is back, and a tapped number box takes the caret
- `3698690` 2026-10-03 — Recipes: a new one starts in no group
- `4d2ad63` 2026-10-04 — A handover, for picking the work up on the other machine

