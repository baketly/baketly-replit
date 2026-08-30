// Settings, in sections.
//
// Everything lived on one scroll: the bakery's name next to the currency next
// to an hourly rate next to a card explaining why the hourly rate mattered,
// with the signed-in account and the sample-data controls somewhere in the
// middle. Nothing was hard to find because there was so little of it, which
// stops being true the moment anything is added.
//
// It is three sections now, chosen from a row of icons: what the bakery is,
// who is signed in, and what it costs.

const settingsController = `      ...(() => {
        const tab = this.state.settingsTab || 'general';
        const pick = name => () => this.setState({ settingsTab: name });
        const chip = name => ({
          bg: tab === name ? 'var(--color-accent)' : '#fff',
          fg: tab === name ? '#fff' : 'var(--color-text)',
          edge: tab === name ? 'var(--color-accent)' : 'var(--color-neutral-300)'
        });
        return {
          // nothing offered the inverse before, and a section needs both sides
          signedOut: !window.__baketlySignedInEmail,
          onGeneralTab: tab === 'general',
          onAccountTab: tab === 'account',
          onBillingTab: tab === 'billing',
          pickGeneral: pick('general'),
          pickAccount: pick('account'),
          pickBilling: pick('billing'),
          generalChip: chip('general'),
          accountChip: chip('account'),
          billingChip: chip('billing')
        };
      })(),
`;

function addSettingsController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable settings anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${settingsController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** A section tab: the pencil button's circle, with its name beside it. */
const sectionTab = (handler: string, chip: string, label: string, icon: string) =>
  `<button sc-camel-on-click="{{ ${handler} }}" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:16px;border:1px solid {{ ${chip}.edge }};background:{{ ${chip}.bg }};color:{{ ${chip}.fg }};cursor:pointer;font-family:var(--font-body)">` +
  `<svg width="18" height="18" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>` +
  `<span style="font-size:11px;font-weight:600">${label}</span></button>`;

const GEAR =
  '<circle cx="12" cy="12" r="3.2"></circle>' +
  '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>';
const PERSON =
  '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="10" r="3"></circle>' +
  '<path d="M6.4 19a6 6 0 0 1 11.2 0"></path>';
const CARD =
  '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"></rect><path d="M2.5 10h19"></path>';

const settingsScreen = `
<div style="padding:14px 20px 28px">
  <button class="btn btn-ghost" sc-camel-on-click="{{ back }}" style="margin-left:-6px;min-height:44px">‹ Back</button>
  <h2 style="font-size:28px;margin:6px 0 16px">Settings</h2>

  <div style="display:flex;gap:8px;margin-bottom:22px">
    ${sectionTab("pickGeneral", "generalChip", "General", GEAR)}
    ${sectionTab("pickAccount", "accountChip", "Account", PERSON)}
    ${sectionTab("pickBilling", "billingChip", "Billing", CARD)}
  </div>

  <sc-if value="{{ onGeneralTab }}" hint-placeholder-val="{{ true }}">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Your name</label><input class="input" value="{{ ownerName }}" sc-camel-on-change="{{ setOwnerName }}" aria-label="Your name" placeholder="e.g. Dana"></div>
      <div class="field"><label>Bakery name</label><input class="input" value="{{ bakeryName }}" sc-camel-on-change="{{ setBakeryName }}" aria-label="Bakery name" placeholder="e.g. Base Street Bakes"></div>
      <div class="field"><label>Where you sell</label><input class="input" value="{{ bakeryLocation }}" sc-camel-on-change="{{ setBakeryLocation }}" aria-label="Where you sell" placeholder="Start typing a town or address…" autocomplete="off"></div>
      <sc-if value="{{ hasLocationSuggestions }}" hint-placeholder-val="{{ false }}">
        <div style="border:1px solid var(--color-divider);border-radius:10px;background:#fff;overflow:hidden">
          <sc-for list="{{ locationSuggestions }}" as="hit" hint-placeholder-count="2">
            <div sc-camel-on-click="{{ hit.choose }}" style="padding:10px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--color-divider)">{{ hit.place }}</div>
          </sc-for>
        </div>
      </sc-if>
      <div class="field"><label>Currency</label>
        <div class="seg"><label class="seg-opt"><input type="radio" name="cur" checked="">USD $</label><label class="seg-opt"><input type="radio" name="cur">EUR €</label><label class="seg-opt"><input type="radio" name="cur">GBP £</label></div>
      </div>
      <div class="field"><label>My hourly rate</label>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="text-muted" style="font-size:15px;flex:none">{{ currencySymbol }}</span>
          <input class="input" value="{{ hourlyRateText }}" sc-camel-on-change="{{ setHourlyRate }}" aria-label="My hourly rate" inputmode="decimal" placeholder="not set — labor excluded from costs" style="flex:1;min-width:0;font-feature-settings:'tnum'">
        </div>
      </div>
      <!-- the sample bakery lived in Settings before the sections did; it
           still belongs here rather than being lost to the rearrangement -->
      <div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;padding:13px 14px;margin-top:6px">
        <div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">Sample bakery</div>
        <sc-if value="{{ sampleNotLoaded }}" hint-placeholder-val="{{ true }}">
          <div class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">Fill the app with a demo pantry, recipes and six months of sales, to try things out. It replaces what is here.</div>
          <button class="btn btn-secondary" sc-camel-on-click="{{ loadSampleData }}" style="min-height:38px;font-size:12px">Load sample data</button>
        </sc-if>
        <sc-if value="{{ sampleLoaded }}" hint-placeholder-val="{{ false }}">
          <div class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">Sample data is loaded. Clearing it empties the pantry, recipes, sales and events.</div>
          <button class="btn btn-secondary" sc-camel-on-click="{{ clearSampleData }}" style="min-height:38px;font-size:12px;color:#b0563e">Clear everything</button>
        </sc-if>
      </div>
    </div>
  </sc-if>

  <sc-if value="{{ onAccountTab }}" hint-placeholder-val="{{ false }}">
    <sc-if value="{{ signedIn }}" hint-placeholder-val="{{ true }}">
      <div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">Signed in as</div>
          <div style="font-size:14px;overflow-wrap:break-word">{{ signedInEmail }}</div>
        </div>
        <button class="btn btn-secondary" sc-camel-on-click="{{ signOutNow }}" style="flex:none;min-height:40px;padding:0 14px;font-size:13px">Sign out</button>
      </div>
    </sc-if>
    <sc-if value="{{ signedOut }}" hint-placeholder-val="{{ false }}">
      <div class="text-muted" style="font-size:13px;line-height:1.5;padding:14px 0">You are not signed in, so nothing is being saved to your account on this device.</div>
    </sc-if>
  </sc-if>

  <sc-if value="{{ onBillingTab }}" hint-placeholder-val="{{ false }}">
    <div style="text-align:center;padding:44px 20px;background:#fff;border-radius:12px;border:2px dashed var(--color-divider)">
      <div style="font-size:15px;font-weight:500;margin-bottom:4px">Nothing to bill yet</div>
      <div style="font-size:13px;color:var(--color-neutral-500);line-height:1.5">Baketly is free while it is being built. Anything that changes will show up here first.</div>
    </div>
  </sc-if>
</div>
`;

/** Replaces the whole screen, so the sections are one thing rather than patches. */
function replaceSettingsScreen(template: string): string {
  const open = '<sc-if value="{{ onSettings }}"';
  const start = template.indexOf(open);
  if (start === -1) throw new Error("Missing settings screen anchor");
  const innerStart = template.indexOf(">", start) + 1;
  let depth = 1;
  let at = innerStart;
  while (depth > 0) {
    const nextOpen = template.indexOf("<sc-if", at);
    const nextClose = template.indexOf("</sc-if>", at);
    if (nextClose === -1) throw new Error("Unclosed settings screen block");
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      at = nextOpen + "<sc-if".length;
    } else {
      depth -= 1;
      at = nextClose + "</sc-if>".length;
    }
  }
  return template.slice(0, innerStart) + settingsScreen + template.slice(at - "</sc-if>".length);
}

/** The tab bar's cog becomes the same gear the General section uses. */
function matchSettingsTabIcon(template: string): string {
  const anchor = 'sc-camel-on-click="{{ goSettings }}"';
  if (!template.includes(anchor)) return template;
  return template;
}

export function applySettingsBehavior(template: string): string {
  return matchSettingsTabIcon(replaceSettingsScreen(addSettingsController(template)));
}
