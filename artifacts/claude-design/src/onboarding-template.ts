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

const SPECIALTIES = [
  "Sourdough",
  "Bread",
  "Babka",
  "Cookies",
  "Cakes",
  "Cupcakes",
  "Pastries",
  "Savoury",
];

const DEFAULT_TARGET_MARGIN = 70;

const STEPS = ["ob1", "ob2", "ob3", "ob4"];

const onboardingController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const options = ${JSON.stringify(SPECIALTIES)};
        const chosen = Array.isArray(this.state.bakerySpecialties) ? this.state.bakerySpecialties : [];

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

        const specialtyList = chosen.length ? chosen.join(', ') : 'nothing chosen yet';
        const rate = Number(this.state.hourlyRate) || 0;
        const target = Number(this.state.targetMargin) || ${DEFAULT_TARGET_MARGIN};
        const town = (this.state.bakeryLocation || '').split(',')[0].trim();

        return {
          obStep1: dot(0), obStep2: dot(1), obStep3: dot(2), obStep4: dot(3),
          onObStep1: this.state.screen === 'ob1',
          onObStep2: this.state.screen === 'ob2',
          onObStep3: this.state.screen === 'ob3',
          onObStep4: this.state.screen === 'ob4',
          obGoStep2: goStep(1),
          obGoStep3: goStep(2),
          obGoStep4: goStep(3),
          obBack: goStep(here - 1),
          obShowBack: here > 0,

          obSpecialties: options.map(label => ({
            label,
            cls: chosen.includes(label) ? 'tag-accent' : 'tag-outline',
            toggle: () => this.setState(s => {
              const current = Array.isArray(s.bakerySpecialties) ? s.bakerySpecialties : [];
              return {
                bakerySpecialties: current.includes(label)
                  ? current.filter(item => item !== label)
                  : [...current, label]
              };
            })
          })),
          obSpecialtySummary: specialtyList,
          hourlyRateText: draft('hourlyRateText', 'hourlyRate'),
          setHourlyRate: setNumber('hourlyRateText', 'hourlyRate', 10000),
          targetMarginText: draft('targetMarginText', 'targetMargin'),
          setTargetMargin: setNumber('targetMarginText', 'targetMargin', 100),
          obRateSummary: rate > 0
            ? 'Your time is set at ' + CUR + rate.toFixed(2) + ' an hour.'
            : 'No hourly rate yet — margins will count ingredients and packaging only.',
          obTargetSummary: 'Baketly will flag any recipe keeping less than ' + Math.round(target) + '% of its price.',
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
    <p class="text-muted" style="font-size:13px;line-height:1.5;margin-top:6px">Four short questions and you are set up. You can change any answer later in Settings.</p>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ obGoStep2 }}" style="min-height:48px;margin-top:auto">Get started</button>
  `;

const stepBakery = `
    <h2 style="font-size:30px;line-height:1.15;margin:0 0 8px">Tell us about your bakery</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:22px">Just a name and roughly where you sell.</p>
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

const stepSpecialties = `
    <h2 style="font-size:30px;line-height:1.15;margin:0 0 8px">What do you usually sell?</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:20px">Pick as many as you like — it shapes the examples and prompts you see. Tap again to remove one.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <sc-for list="{{ obSpecialties }}" as="opt" hint-placeholder-count="4">
        <span class="tag {{ opt.cls }}" sc-camel-on-click="{{ opt.toggle }}" style="cursor:pointer;user-select:none;padding:8px 14px;font-size:13px">{{ opt.label }}</span>
      </sc-for>
    </div>
    <p class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:28px">Chosen: {{ obSpecialtySummary }}</p>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ obGoStep4 }}" style="min-height:48px;margin-top:auto">Continue</button>
  `;

const stepPricing = `
    <h2 style="font-size:30px;line-height:1.15;margin:0 0 8px">How you want to be paid</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:20px">Two numbers Baketly uses to judge whether a recipe earns its keep. Both are optional — you can set them later.</p>
    <div class="field" style="margin-bottom:6px">
      <label>My hourly rate</label>
      <input class="input" value="{{ hourlyRateText }}" sc-camel-on-change="{{ setHourlyRate }}" aria-label="My hourly rate" inputmode="decimal" placeholder="not set — labor excluded from costs" style="font-feature-settings:'tnum'">
    </div>
    <p class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:16px">What your own time is worth. Without it, a margin only counts ingredients and packaging.</p>
    <div class="field" style="margin-bottom:6px">
      <label>Target margin (%)</label>
      <input class="input" value="{{ targetMarginText }}" sc-camel-on-change="{{ setTargetMargin }}" aria-label="Target margin" inputmode="decimal" placeholder="70" style="font-feature-settings:'tnum'">
    </div>
    <p class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:20px">The share of a price you want to keep. Anything below it gets flagged for you.</p>
    <div style="border-top:2px solid var(--color-text);padding-top:16px;margin-bottom:28px">
      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-accent);margin-bottom:8px">What this sets up</div>
      <p style="font-size:14px;line-height:1.6;margin-bottom:6px">{{ obTargetSummary }}</p>
      <p class="text-muted" style="font-size:13px;line-height:1.6">{{ obRateSummary }}</p>
    </div>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ finishOnboarding }}" style="min-height:48px;margin-top:auto">Take me to my bakery</button>
  `;

const dot = (binding: string) =>
  `<div style="width:24px;height:2px;border-radius:1px;background:{{ ${binding} }}"></div>`;

const onboardingScreen = `
<div style="padding:24px 24px 40px;display:flex;flex-direction:column;min-height:100%;box-sizing:border-box">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div style="display:flex;gap:6px">
      ${dot("obStep1")}${dot("obStep2")}${dot("obStep3")}${dot("obStep4")}
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
  <sc-if value="{{ onObStep3 }}" hint-placeholder-val="{{ false }}">${stepSpecialties}</sc-if>
  <sc-if value="{{ onObStep4 }}" hint-placeholder-val="{{ false }}">${stepPricing}</sc-if>
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

/** The same values, editable afterwards. */
function bindSettingsFields(template: string): string {
  const hourly =
    '<div class="field"><label>My hourly rate</label><input class="input" placeholder="not set — labor excluded from costs"></div>';
  const target =
    '<div class="field"><label>Target margin</label><input class="input" value="70%" style="font-feature-settings:\'tnum\'"></div>';
  if (!template.includes(hourly)) throw new Error("Missing settings hourly rate anchor");
  if (!template.includes(target)) throw new Error("Missing settings target margin anchor");

  let out = template.replace(
    hourly,
    () =>
      '<div class="field"><label>What you usually make</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">' +
      '<sc-for list="{{ obSpecialties }}" as="opt" hint-placeholder-count="4">' +
      '<span class="tag {{ opt.cls }}" sc-camel-on-click="{{ opt.toggle }}" style="cursor:pointer;user-select:none;padding:7px 13px;font-size:13px">{{ opt.label }}</span>' +
      "</sc-for></div></div>" +
      '<div class="field"><label>My hourly rate</label><input class="input" value="{{ hourlyRateText }}" sc-camel-on-change="{{ setHourlyRate }}" aria-label="My hourly rate" inputmode="decimal" placeholder="not set — labor excluded from costs" style="font-feature-settings:\'tnum\'"></div>',
  );

  return out.replace(
    target,
    () =>
      '<div class="field"><label>Target margin (%)</label><input class="input" value="{{ targetMarginText }}" sc-camel-on-change="{{ setTargetMargin }}" aria-label="Target margin" inputmode="decimal" placeholder="70" style="font-feature-settings:\'tnum\'"></div>',
  );
}

/** Setup runs on its own now, so Settings no longer needs a way to replay it. */
function removeReplayButton(template: string): string {
  const anchor =
    '\n  <div class="hr"></div>\n  <button class="btn btn-secondary btn-block" sc-camel-on-click="{{ goOb1 }}" style="min-height:48px">Replay onboarding</button>';
  if (!template.includes(anchor)) throw new Error("Missing replay onboarding anchor");
  return template.replace(anchor, () => "");
}

export function applyOnboardingBehavior(template: string): string {
  let out = addOnboardingController(template);
  out = replaceBlock(out, "onOb", onboardingScreen);
  out = hideTabsDuringOnboarding(out);
  out = openOnFirstRun(out);
  out = bindSettingsFields(out);
  return removeReplayButton(out);
}
