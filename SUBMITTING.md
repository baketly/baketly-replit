# Submitting Baketly to the App Store

What App Review asks for, and the answers as the code actually behaves. Written
against Apple's guidelines in October 2026; the numbered references are theirs.

Everything in the first section is done in the repository. Everything after it
is done by hand in App Store Connect, and is the part that gets apps rejected.

---

## Already handled in the app

| What | Guideline | Where |
|---|---|---|
| Delete your account, from inside the app | 5.1.1(v) | Settings → Delete my account → `DELETE /api/auth/account` |
| Sign in with Apple, beside Google | 4.8 | Login screen, with email and password as a third option |
| Privacy policy reachable without an account | 5.1.1(i) | Login screen → Privacy Policy |
| Purpose strings for every permission asked for | 5.1.1(ii) | `Info.plist`: camera and photo library only |
| No permissions asked for that nothing uses | 5.1.1 | Microphone and speech recognition removed with the plugin |
| Export compliance answered | — | `ITSAppUsesNonExemptEncryption` is `false`: HTTPS only |
| No ads, no tracking, no third-party analytics | 5.1.2 | None in the app |
| No in-app purchases, no external payment links | 3.1 | The till records cash; card is marked coming soon and disabled |

---

## 1. A demo account, with something in it

**Guideline 2.1.** The app shows nothing without a login, so without this the
reviewer sees a login screen and rejects the app as non-functional. An account
with an empty bakery is barely better: every screen reads "nothing yet".

Do this on the **live** app, not a local build:

1. Sign up in the App Store build, or at `https://baketly-app.replit.app`, with
   an address you keep — `review@baketly.com` or similar.
2. Open **Settings → Sample bakery → Load sample data**. It fills the app with a
   demo pantry, recipes and six months of sales, so every screen has something
   on it. This is the single most useful thing you can do for the reviewer.
3. Run one market check on the Markets screen, so Analytics and the nearby
   prices have real figures in them.
4. Make one sale through the till so the Analytics tabs are not empty.

Then in App Store Connect → **App Review Information**:

- Sign-in required: **Yes**
- Username and password: the account above
- Leave the account alone until the app is approved. Reviewers come back to it.

---

## 2. Privacy labels

**App Store Connect → App Privacy.** These must match the privacy policy, and a
mismatch is a common rejection. Derived from what the code actually sends.

### Contact Info → Email Address — collected, linked to the user
- **App Functionality.** The account itself.
- Also covers **a customer's email address** typed into the till to send them a
  receipt. It is sent to Resend, which delivers the email, and is not stored
  afterwards. Declare it: it leaves the device, which is what Apple counts.

### Contact Info → Name — collected, linked to the user
- **App Functionality.** Only if the baker fills in a display name or a bakery
  name. Both are optional, and both are stored.

### User Content → Photos or Videos — collected, linked to the user
- **App Functionality.** Recipe photographs are stored with the recipe.
- Nutrition label photographs are sent to Google's Gemini API to be read and
  are not kept afterwards. Declare them anyway: they leave the device.

### User Content → Other User Content — collected, linked to the user
- **App Functionality.** The bakery itself: ingredients, recipes, prices,
  sales, markets. This is the app's whole purpose.

### Location → Coarse Location — collected, linked to the user
- **App Functionality.** The town or address typed in to find nearby bakeries.
  The app never asks the phone for its location and has no location permission;
  this is text the baker types. It still describes where they are, so declare it.

### Everything else — not collected
No identifiers, no usage data, no diagnostics, no purchases, no contacts, no
health, no financial account data, no browsing history, no sensitive info.

### The three follow-up questions
- Used for tracking: **No** for every category.
- Used for third-party advertising: **No.**
- Linked to identity: **Yes**, for all of the above, since they hang off an
  account.

---

## 3. Review notes

**Guideline 4.2** is the real risk: Baketly is a web view in a native shell, and
reviewers reject those as repackaged websites unless the native parts are
obvious. They are there — but say so rather than hoping they are found.

Paste something like this into **App Review Information → Notes**:

> Baketly is a costing and pricing tool for home bakers: it works out what each
> bake costs from ingredient prices, what it earns at a market, and what nearby
> bakeries charge.
>
> Demo account: `<email>` / `<password>`. It is loaded with sample ingredients,
> recipes and six months of sales, so every screen has data.
>
> Features that use the device rather than the web:
>
> - **Camera.** Pantry → add an ingredient → scan a nutrition label. The
>   photograph is read on the server and the figures fill the form.
> - **Local notifications.** Settings → Reminders. A reminder before a market
>   and before the shopping, scheduled on the device. Tapping one opens the
>   market or the shopping list it is about.
> - **Sign in with Apple**, offered beside Google and email.
> - The bakery is held on the device and works without a connection; it syncs
>   when there is one.
>
> Account deletion: Settings → Delete my account, which removes the account and
> everything in it.
>
> Payments: the till records cash sales as bookkeeping. Nothing is charged
> through the app and there is no in-app purchase.

---

## 4. Before the build goes up

- **Screenshots** for every size App Store Connect demands, taken from the
  account with the sample data in it. Empty screens look like a broken app.
- **Support URL** — required, and must resolve. `baketly.com` needs a page with
  a way to make contact.
- **Privacy policy URL** — `https://baketly-app.replit.app/api/privacy`. Note the
  `/api`: plain `/privacy` returns the app shell, not the policy, and a reviewer
  following it would see a blank page. Same words as the in-app screen; both come
  from one file, `lib/policy`.
- **Age rating.** Nothing in Baketly needs a rating above 4+.
- **Publish the API first.** The in-app privacy policy and the receipt email
  both come from the server, so the deployed API must be the current one before
  the build is reviewed.

---

## Two things nobody will ask about until they do

**Receipts only work once `baketly.com` is verified in Resend.** Until then the
till honestly reports that the sending domain is not verified, and no receipt
reaches anybody. That is not a rejection, but it is a feature a reviewer might
try.

**The app needs its backend up for the whole review.** Guideline 2.1 is explicit
that the service has to be running. A sleeping deployment reads as a broken app.
