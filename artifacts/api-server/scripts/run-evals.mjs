// Asks Ask Baketly the questions bakers ask, and checks what comes back.
//
// Not part of `pnpm test`. Every case is a real conversation with the model,
// so this takes minutes and costs money, and it needs a running server with a
// Gemini key. Run it after changing the prompt or the tools, and before
// publishing.
//
//   pnpm run eval                     everything
//   pnpm run eval -- pantry thread    only cases whose questions match
//
// What it is for: every rule in the prompt is a sentence, and nothing else
// holds it in place. Two of the defects these cases cover were caused by rules
// added to fix earlier ones. The unit tests check the tools and never look at
// an answer; this looks only at answers.

import { BAKERIES } from "./evals/bakeries.mjs";
import { ALWAYS, CASES } from "./evals/cases.mjs";

const API = process.env.EVAL_API ?? "http://localhost:5000";
const filters = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const OFF = "[0m";

async function signUp() {
  const res = await fetch(`${API}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `eval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      password: "evaluation-12345",
    }),
  });
  if (!res.ok) throw new Error(`could not create an account: ${res.status}`);
  return (await res.json()).token;
}

async function seed(token, state) {
  const res = await fetch(`${API}/api/workspace-state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error(`could not seed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function ask(token, question, history) {
  const res = await fetch(`${API}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question, history }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ask failed ${res.status}: ${payload.error ?? ""}`);
  return String(payload.answer ?? "");
}

// ---- run ----------------------------------------------------------------

const chosen = filters.length
  ? CASES.filter((one) => filters.some((f) => one.ask.join(" ").toLowerCase().includes(f.toLowerCase())))
  : CASES;

if (!chosen.length) {
  console.error("no cases matched", filters.join(" "));
  process.exit(1);
}

console.log(`Asking ${chosen.length} of ${CASES.length} cases against ${API}\n`);

let passed = 0;
const failures = [];
const started = Date.now();

// One account for the whole run, re-seeded before each case. Signing up per
// case trips the server's own rate limit six cases in, which is the limit
// working rather than a fault.
const token = await signUp();

for (const one of chosen) {
  const bakery = BAKERIES[one.bakery];
  await seed(token, bakery.state);

  // Only the last answer is checked; earlier questions are there to build the
  // thread a follow-up depends on.
  const history = [];
  let answer = "";
  for (const question of one.ask) {
    answer = await ask(token, question, history);
    history.push({ who: "you", text: question }, { who: "baketly", text: answer });
  }

  const asked = one.ask[one.ask.length - 1];
  const broken = [...one.checks, ...ALWAYS].filter((check) => !check.ok(answer));

  if (broken.length === 0) {
    passed += 1;
    console.log(`${GREEN}pass${OFF}  ${asked}  ${DIM}(${bakery.label})${OFF}`);
  } else {
    console.log(`${RED}FAIL${OFF}  ${asked}  ${DIM}(${bakery.label})${OFF}`);
    for (const check of broken) console.log(`      ${RED}·${OFF} ${check.what}`);
    console.log(`      ${DIM}${answer}${OFF}`);
    failures.push({ asked, bakery: bakery.label, broken: broken.map((c) => c.what), answer });
  }
}

const seconds = Math.round((Date.now() - started) / 1000);
console.log(
  `\n${passed} of ${chosen.length} passed in ${seconds}s` +
    (failures.length ? `, ${failures.length} to look at` : ""),
);

// A failure here is a judgement about wording as much as about correctness, so
// it does not fail a build; it is for a person to read.
process.exit(0);
