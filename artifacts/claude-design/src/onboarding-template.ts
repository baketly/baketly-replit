// First-run setup, and the settings it fills in.
//
// The mockup shipped three onboarding screens that collected nothing: the
// "What do you usually make?" chips had no click handler, screen two showed a
// Mini Chocolate Babka it claimed to have created but never did, and screen
// three quoted a margin for that imaginary recipe. Nothing reached state, and
// the flow only ran if you found "Replay onboarding" buried in Settings.
//
// It now runs once for a new baker and explains itself before asking for
// anything: what Baketly is, then the bakery and where it sells and why that
// matters, then what they make, then how they want to be paid for it. Every
// step can be walked back.

const STEPS = ["ob1", "ob2", "ob3"];

const onboardingController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const steps = ${JSON.stringify(STEPS)};
        const here = steps.indexOf(this.state.screen);
        const dot = index => (index <= here ? 'var(--color-accent)' : 'var(--color-neutral-300)');
        const goStep = index => () => this.setState({ screen: steps[Math.max(0, Math.min(steps.length - 1, index))] });

        // A number coerced back into its own input erases an in-progress
        // decimal point, so the raw text is kept beside the parsed value.
        const draft = (textKey, valueKey) => {
          const text = this.state[textKey];
          if (text !== undefined && text !== null) return String(text);
          const value = Number(this.state[valueKey]);
          return value > 0 ? String(value) : '';
        };
        const setNumber = (textKey, valueKey, max) => e => {
          const raw = String(e.target.value || '').slice(0, 10);
          const parsed = Number(raw.replace(/[^0-9.]/g, ''));
          this.setState({
            [textKey]: raw,
            [valueKey]: Math.min(max, Math.max(0, isFinite(parsed) ? parsed : 0))
          });
        };

        const finish = () => this.setState({ onboardingComplete: true, screen: 'dash', stack: [] });

        const rate = Number(this.state.hourlyRate) || 0;
        const town = (this.state.bakeryLocation || '').split(',')[0].trim();

        return {
          obStep1: dot(0), obStep2: dot(1), obStep3: dot(2),
          onObStep1: this.state.screen === 'ob1',
          onObStep2: this.state.screen === 'ob2',
          onObStep3: this.state.screen === 'ob3',
          obGoStep2: goStep(1),
          obGoStep3: goStep(2),
          obBack: goStep(here - 1),
          obShowBack: here > 0,

          hourlyRateText: draft('hourlyRateText', 'hourlyRate'),
          setHourlyRate: setNumber('hourlyRateText', 'hourlyRate', 10000),
          obRateSummary: rate > 0
            ? 'Your time is set at ' + CUR + rate.toFixed(2) + ' an hour, and every recipe will count it.'
            : 'Leave it blank and a margin counts ingredients and packaging only. You can set it later in Settings.',
          obNearby: town
            ? 'Baketly will look at what bakeries in ' + town + ' charge.'
            : 'Without it, Baketly can still cost your recipes — it just cannot tell you how your prices compare.',
          finishOnboarding: finish,
          skipOnboarding: finish
        };
      })(),
`;

function addOnboardingController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable onboarding anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${onboardingController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** Replaces the body of one `sc-if` block, matching its own close tag. */
function replaceBlock(template: string, flag: string, markup: string): string {
  const open = `<sc-if value="{{ ${flag} }}"`;
  const start = template.indexOf(open);
  if (start === -1) throw new Error(`Missing block ${flag}`);
  const innerStart = template.indexOf(">", start) + 1;
  let depth = 1;
  let cursor = innerStart;
  while (depth > 0) {
    const nextOpen = template.indexOf("<sc-if", cursor);
    const nextClose = template.indexOf("</sc-if>", cursor);
    if (nextClose === -1) throw new Error(`Unclosed block ${flag}`);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 6;
    } else {
      depth -= 1;
      if (depth === 0) return template.slice(0, innerStart) + markup + template.slice(nextClose);
      cursor = nextClose + 8;
    }
  }
  throw new Error(`Unclosed block ${flag}`);
}

const point = (title: string, body: string) =>
  '<div style="display:flex;gap:12px;margin-bottom:14px">' +
  '<span style="flex:none;width:7px;height:7px;border-radius:50%;background:var(--color-accent);margin-top:7px"></span>' +
  '<div><div style="font-size:14px;font-weight:600;margin-bottom:2px">' + title + "</div>" +
  '<div class="text-muted" style="font-size:13px;line-height:1.5">' + body + "</div></div></div>";

const stepWhatIsBaketly = `
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-accent);margin-bottom:8px">Welcome to Baketly</div>
    <h2 style="font-size:30px;line-height:1.15;margin:0 0 10px">Know what every bake really costs</h2>
    <p class="text-muted" style="font-size:14px;line-height:1.6;margin-bottom:22px">Tell Baketly what you buy and what you bake, and it works out the rest.</p>
    ${point("Your pantry", "Enter what a sack of flour costs once. Baketly works out the price of every gram you use.")}
    ${point("Your recipes", "Each one prices itself from that pantry, so you can see what it costs and what it keeps.")}
    ${point("Your markets", "Plan what to bake, sell from your phone, and see what the day was actually worth.")}
    <p class="text-muted" style="font-size:13px;line-height:1.5;margin-top:6px">It takes a minute, and you can change any answer later in Settings.</p>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ obGoStep2 }}" style="min-height:48px;margin-top:auto">Get started</button>
  `;

const stepBakery = `
    <h2 style="font-size:30px;line-height:1.15;margin:0 0 8px">Tell us about your bakery</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:22px">Your name, the bakery's, and roughly where you sell.</p>
    <div class="field" style="margin-bottom:16px">
      <label>Your name</label>
      <input class="input" value="{{ ownerName }}" sc-camel-on-change="{{ setOwnerName }}" aria-label="Your name" placeholder="e.g. Dana">
    </div>
    <div class="field" style="margin-bottom:16px">
      <label>Bakery name</label>
      <input class="input" value="{{ bakeryName }}" sc-camel-on-change="{{ setBakeryName }}" aria-label="Bakery name" placeholder="e.g. Base Street Bakes">
    </div>
    <div class="field" style="margin-bottom:8px">
      <label>Where do you sell?</label>
      <input class="input" value="{{ bakeryLocation }}" sc-camel-on-change="{{ setBakeryLocation }}" aria-label="Where do you sell" placeholder="Start typing a town or address…" autocomplete="off">
    </div>
    <sc-if value="{{ hasLocationSuggestions }}" hint-placeholder-val="{{ false }}">
      <div style="border:1px solid var(--color-divider);border-radius:10px;background:#fff;overflow:hidden;margin-bottom:12px">
        <sc-for list="{{ locationSuggestions }}" as="hit" hint-placeholder-count="2">
          <div sc-camel-on-click="{{ hit.choose }}" style="padding:10px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--color-divider)">{{ hit.place }}</div>
        </sc-for>
      </div>
    </sc-if>
    <div class="card" style="gap:6px;margin:14px 0 20px">
      <span class="card-kicker">Why Baketly asks</span>
      <div style="font-size:14px;line-height:1.55">Pricing only means something next to what people near you already pay. Baketly checks what comparable bakeries in your area charge, twice a week, and tells you where you sit.</div>
      <div class="text-muted" style="font-size:13px;line-height:1.5">{{ obNearby }}</div>
    </div>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ obGoStep3 }}" style="min-height:48px;margin-top:auto">Continue</button>
  `;

const stepPricing = `
    <h2 style="font-size:30px;line-height:1.15;margin:0 0 8px">What your time is worth</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:20px">Baketly counts ingredients and packaging on its own. Tell it what an hour of yours costs and it can count that too.</p>
    <div class="field" style="margin-bottom:6px">
      <label>My hourly rate</label>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="text-muted" style="font-size:15px;flex:none">{{ currencySymbol }}</span>
        <input class="input" value="{{ hourlyRateText }}" sc-camel-on-change="{{ setHourlyRate }}" aria-label="My hourly rate" inputmode="decimal" placeholder="not set — labor excluded from costs" style="flex:1;min-width:0;font-feature-settings:'tnum'">
      </div>
    </div>
    <p class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:20px">A recipe that takes an hour and yields twelve carries an hour of your time across those twelve.</p>
    <div class="card" style="gap:6px;margin:4px 0 24px">
      <span class="card-kicker">What this sets up</span>
      <div style="font-size:14px;line-height:1.55">{{ obRateSummary }}</div>
    </div>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ finishOnboarding }}" style="min-height:48px;margin-top:auto">Take me to my bakery</button>
  `;

const dot = (binding: string) =>
  `<div style="width:24px;height:2px;border-radius:1px;background:{{ ${binding} }}"></div>`;

const onboardingScreen = `
<div style="padding:24px 24px 40px;display:flex;flex-direction:column;min-height:100%;box-sizing:border-box">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div style="display:flex;gap:6px">
      ${dot("obStep1")}${dot("obStep2")}${dot("obStep3")}
    </div>
    <button class="btn btn-ghost" sc-camel-on-click="{{ skipOnboarding }}" style="min-height:44px">Skip</button>
  </div>
  <div style="min-height:34px;margin-bottom:8px">
    <sc-if value="{{ obShowBack }}" hint-placeholder-val="{{ false }}">
      <button class="btn btn-ghost" sc-camel-on-click="{{ obBack }}" style="margin-left:-6px;min-height:34px;padding:2px 8px">‹ Back</button>
    </sc-if>
  </div>
  <sc-if value="{{ onObStep1 }}" hint-placeholder-val="{{ true }}">${stepWhatIsBaketly}</sc-if>
  <sc-if value="{{ onObStep2 }}" hint-placeholder-val="{{ false }}">${stepBakery}</sc-if>
  <sc-if value="{{ onObStep3 }}" hint-placeholder-val="{{ false }}">${stepPricing}</sc-if>
</div>
`;

/** The tab bar would let a new baker wander out of a half-finished setup. */
function hideTabsDuringOnboarding(template: string): string {
  const anchor = "tabsVisible: true";
  if (!template.includes(anchor)) throw new Error("Missing tabsVisible anchor");
  return template.replace(anchor, () => "tabsVisible: !screen.startsWith('ob')");
}

/**
 * Opens on the setup flow for a baker who has not been through it and has
 * nothing in the workspace yet, so existing accounts are never interrupted.
 */
function openOnFirstRun(template: string): string {
  const anchor = ",\n    ...(window.__baketlyServerState || {})\n  };";
  if (!template.includes(anchor)) throw new Error("Missing server state anchor");
  return template.replace(
    anchor,
    () =>
      ",\n    ...(window.__baketlyServerState || {})," +
      "\n    ...((() => {" +
      "\n      const saved = window.__baketlyServerState || {};" +
      "\n      const untouched = !(saved.recipeRecords || []).length" +
      "\n        && !Object.keys(saved.ingredientRecords || {}).length" +
      "\n        && !(saved.saleRecords || []).length" +
      "\n        && !(saved.eventRecords || []).length;" +
      "\n      return saved.onboardingComplete !== true && untouched ? { screen: 'ob1' } : {};" +
      "\n    })())\n  };",
  );
}

export function applyOnboardingBehavior(template: string): string {
  let out = addOnboardingController(template);
  out = replaceBlock(out, "onOb", onboardingScreen);
  out = hideTabsDuringOnboarding(out);
  return openOnFirstRun(out);
}
