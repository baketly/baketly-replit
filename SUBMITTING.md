# Submitting Baketly to the App Store

Do these in order. The order matters: the first two steps change the build, so
doing them afterwards means uploading twice.

Written against Apple's guidelines in October 2026. Numbered references are
theirs.

---

## 1. Receipts — done, but prove it once

baketly.com is verified in Resend and the four DNS records are live, so receipts
can deliver. Send yourself one real receipt from the app before submitting:
make a sale, put your own address in the receipt box, and check it arrives.

It matters because a reviewer who finishes a test sale sees that box and will
plausibly try it, and a prominent control that cannot do its job is
**Guideline 2.1**.

---

## 2. Pull and rebuild — again

The app was set to iPhone only **after** your last rebuild. Upload the build you
have now and Apple will test it on an iPad, and App Store Connect will demand
iPad screenshots before it will take the submission.

```
cd ~/baketly-replit && git stash && git pull && pnpm install
cd artifacts/claude-design && VITE_API_BASE=https://baketly-app.replit.app pnpm --filter @workspace/claude-design run build && npx cap sync ios
```

In Xcode, check **General → Deployment Info** shows iPhone with iPad unticked
before you archive.

---

## 3. The demo account

**Guideline 2.1.** Without one the reviewer sees a login screen, and an app that
shows nothing is rejected as incomplete. An empty account is barely better:
every screen reads "nothing yet".

On the **live** app, not a local build:

1. Sign up with an address you keep — `review@baketly.com` or similar.
2. The sample bakery — a demo pantry, recipes and six months of sales — is
   already loaded on the review account and saved on the server. The Load and
   Clear buttons were removed from Settings before submission, on purpose, so a
   reviewer cannot wipe it. (The handlers are still in the controller; putting
   the button back is a one-line change in `settings-template.ts`.)
3. Run one market check from the Markets screen, so Analytics and the nearby
   prices hold real figures.
4. Record one cash sale through the till, so the Analytics tabs are not empty.
5. Leave the account alone until the app is approved. Reviewers come back to it.

---

## 4. Upload the build

Xcode → **Product → Archive** → Distribute App → App Store Connect.

Version 1.0, build 1. If you upload again for any reason the build number must
go up; the version need not.

---

## 5. App Store Connect

### App Information
- **Name**, **subtitle**, **category** — Business, or Food & Drink.
- **Age rating**: nothing in Baketly rates above 4+.
- **Privacy policy URL**: `https://baketly-app.replit.app/api/privacy`
  Note the `/api`. Plain `/privacy` returns the app shell, so a reviewer
  following that link sees a blank page and rejects under 5.1.1(i).
- **Support URL**: `https://baketly.com` — live, and it carries the contact
  address. `https://baketly-app.replit.app/api/support` also works and answers
  the common questions directly, if you would rather point at that.

### Screenshots
Required for 6.9" and 6.5" iPhones. Take them from the demo account **with the
sample data loaded** — empty screens read as a broken app. No iPad screenshots,
now that the app is iPhone only.

### App Privacy

Must match the privacy policy; a mismatch is a common rejection. Worked out from
what the code actually sends.

| Category | Collected | Linked to identity | Purpose |
|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | App Functionality |
| Contact Info → Name | Yes | Yes | App Functionality |
| User Content → Photos or Videos | Yes | Yes | App Functionality |
| User Content → Other User Content | Yes | Yes | App Functionality |
| Location → Coarse Location | Yes | Yes | App Functionality |

- **Email address** covers both the account and a customer's address typed into
  the till to send a receipt. The second is somebody else's data: it goes to
  Resend to be delivered, and is not stored. Declare it — it leaves the device,
  which is what Apple counts.
- **Name** is the display name and the bakery name. Both optional, both stored.
- **Photos** are recipe pictures, which are stored, and nutrition labels, which
  go to Google's Gemini API to be read and are not kept.
- **Other User Content** is the bakery itself: ingredients, recipes, prices,
  sales, markets.
- **Coarse Location** is the town typed in to find nearby bakeries. The app never
  asks the phone where it is and holds no location permission, but the text
  still describes where the baker is, so declare it.

Everything else: **not collected.** No identifiers, usage data, diagnostics,
purchases, contacts, health, financial or browsing data.

The three follow-ups: **tracking — no.** **Third-party advertising — no.**
**Linked to identity — yes**, since all of it hangs off an account.

### App Review Information
- Sign-in required: **Yes**, with the demo account from step 3.
- Notes: the text below.

---

## 6. Review notes

**Guideline 4.2** is the real risk here. Baketly is a web view in a native
shell, and reviewers reject those as repackaged websites unless the native parts
are obvious. They are there — say so rather than hoping they are noticed.

> Baketly is a costing and pricing tool for home bakers. It works out what each
> bake costs from ingredient prices, what it earns at a market, and what nearby
> bakeries charge for the same thing.
>
> Demo account: `<email>` / `<password>`. It is loaded with a sample pantry,
> recipes and six months of sales, so every screen has data in it.
>
> Features that use the device rather than the web:
>
> - **Camera.** Pantry → add an ingredient → scan a nutrition label. The
>   photograph is read and the figures fill the form.
> - **Local notifications.** Settings → Reminders. A reminder before a market
>   and before the shopping, scheduled on the device; tapping one opens the
>   market or the shopping list it belongs to.
> - **Sign in with Apple**, offered beside Google and email and password.
> - The bakery is held on the device and readable without a connection.
>
> Account deletion: Settings → Delete my account. It removes the account, the
> bakery and the session.
>
> Nearby prices are read from other bakeries' own public websites and shown with
> a link to the page they came from. Nothing is reproduced beyond a product name
> and a price.
>
> Payments: the till records cash sales as bookkeeping. Nothing is charged
> through the app and there is no in-app purchase.

---

## Already satisfied, for reference

| Requirement | Guideline | Where |
|---|---|---|
| Account deletion inside the app | 5.1.1(v) | Settings → Delete my account; removes workspace, user and session |
| Sign in with Apple beside Google | 4.8 | Login screen, with email and password as a third option |
| Privacy policy reachable without an account | 5.1.1(i) | Login screen → Privacy Policy |
| A purpose string for every permission | 5.1.1(ii) | Camera, photo library, microphone and speech recognition — all used |
| No permission asked for that nothing uses | 5.1.1 | The microphone is back from the build after review: it dictates a question into Ask Baketly, and the policy says Apple transcribes it |
| Third-party data sharing disclosed | 5.1.2(i) | Gemini and Resend, both named in the policy |
| Export compliance answered | — | `ITSAppUsesNonExemptEncryption` false: HTTPS only |
| App icon with no alpha channel | — | One 1024px icon, RGB |
| No ads, tracking or analytics | 5.1.2 | None |
| No in-app purchase, no external payment | 3.1 | Cash till; card disabled and marked coming soon |

---

## If it comes back rejected

Most rejections are a question rather than a verdict. Answer in Resolution
Center with specifics — which screen, which taps, what to look at — instead of
resubmitting unchanged. A reply usually turns it round in a day; a silent
resubmission starts the queue again.

The two most likely questions for this app:

- **4.2, minimum functionality.** Point at the camera scanner and the
  reminders, with the exact taps to reach each.
- **5.1.1(v), account deletion.** Point at Settings → Delete my account.

---

## Keep the backend up

**Guideline 2.1** is explicit that the service must be running during review.
The deployment at `baketly-app.replit.app` has to stay live from submission
until approval. A sleeping deployment reads as a broken app.
