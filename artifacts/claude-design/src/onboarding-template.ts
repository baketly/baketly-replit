// First-run setup, and the settings it fills in.
//
// The mockup shipped three onboarding screens that collected nothing: the
// "What do you usually make?" chips had no click handler, screen two showed a
// Mini Chocolate Babka it claimed to have created but never did, and screen
// three quoted a margin for that imaginary recipe. Nothing reached state, and
// the flow only ran if you found "Replay onboarding" buried in Settings.
//
// Now it runs once for a new baker, every field is bound, and the same values
// are editable afterwards in Settings.

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

const onboardingController = `      ...(() => {
        const options = ${JSON.stringify(SPECIALTIES)};
        const chosen = Array.isArray(this.state.bakerySpecialties) ? this.state.bakerySpecialties : [];

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

        const specialtyList = chosen.length
          ? chosen.join(', ')
          : 'nothing chosen yet';
        const rate = Number(this.state.hourlyRate) || 0;
        const target = Number(this.state.targetMargin) || ${DEFAULT_TARGET_MARGIN};

        return {
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
            ? 'Your time is set at $' + rate.toFixed(2) + ' an hour.'
            : 'No hourly rate yet — margins will count ingredients and packaging only.',
          obTargetSummary: 'Baketly will flag any recipe keeping less than ' + Math.round(target) + '% of its price.',
          obBakeryName: (this.state.bakeryName || '').trim() || 'your bakery',
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

const stepOne = `
    <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-accent);margin-bottom:8px">Welcome to Baketly</div>
    <h2 style="font-size:32px;margin:0 0 8px">Tell us about your bakery</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:24px">We'll use this to set up your workspace. You can change any of it later in Settings.</p>
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
    <p class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:28px">Baketly uses this to compare your prices with bakeries near you.</p>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ goOb2 }}" style="min-height:48px;margin-top:auto">Continue</button>
  `;

const stepTwo = `
    <h2 style="font-size:32px;margin:0 0 8px">What do you usually make?</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:24px">Pick as many as you like. Tap again to remove one.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <sc-for list="{{ obSpecialties }}" as="opt" hint-placeholder-count="4">
        <span class="tag {{ opt.cls }}" sc-camel-on-click="{{ opt.toggle }}" style="cursor:pointer;user-select:none;padding:8px 14px;font-size:13px">{{ opt.label }}</span>
      </sc-for>
    </div>
    <p class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:28px">Chosen: {{ obSpecialtySummary }}</p>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ goOb3 }}" style="min-height:48px;margin-top:auto">Continue</button>
  `;

const stepThree = `
    <h2 style="font-size:32px;margin:0 0 8px">How you price</h2>
    <p class="text-muted" style="font-size:14px;margin-bottom:24px">Two numbers Baketly uses to judge whether a recipe earns its keep.</p>
    <div class="field" style="margin-bottom:16px">
      <label>My hourly rate</label>
      <input class="input" value="{{ hourlyRateText }}" sc-camel-on-change="{{ setHourlyRate }}" aria-label="My hourly rate" inputmode="decimal" placeholder="not set — labor excluded from costs" style="font-feature-settings:'tnum'">
    </div>
    <div class="field" style="margin-bottom:20px">
      <label>Target margin (%)</label>
      <input class="input" value="{{ targetMarginText }}" sc-camel-on-change="{{ setTargetMargin }}" aria-label="Target margin" inputmode="decimal" placeholder="70" style="font-feature-settings:'tnum'">
    </div>
    <div style="border-top:2px solid var(--color-text);padding-top:16px;margin-bottom:28px">
      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-accent);margin-bottom:8px">What this sets up</div>
      <p style="font-size:14px;line-height:1.6;margin-bottom:6px">{{ obTargetSummary }}</p>
      <p class="text-muted" style="font-size:13px;line-height:1.6">{{ obRateSummary }}</p>
    </div>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ finishOnboarding }}" style="min-height:48px;margin-top:auto">Take me to my bakery</button>
  `;

/** The Skip button has to record the choice, or the flow returns every reload. */
function bindSkip(template: string): string {
  const anchor =
    '<button class="btn btn-ghost" sc-camel-on-click="{{ goDash }}" style="min-height:44px">Skip</button>';
  if (!template.includes(anchor)) throw new Error("Missing onboarding skip anchor");
  return template.replace(
    anchor,
    () =>
      '<button class="btn btn-ghost" sc-camel-on-click="{{ skipOnboarding }}" style="min-height:44px">Skip</button>',
  );
}

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
  out = replaceBlock(out, "onOb1", stepOne);
  out = replaceBlock(out, "onOb2", stepTwo);
  out = replaceBlock(out, "onOb3", stepThree);
  out = bindSkip(out);
  out = hideTabsDuringOnboarding(out);
  out = openOnFirstRun(out);
  out = bindSettingsFields(out);
  return removeReplayButton(out);
}
