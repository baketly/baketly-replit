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
        // Reminders, and the clock they are read in.
        //
        // The timezone comes from the phone, not the server: a baker in New
        // Jersey and a server in Frankfurt disagree about when eight in the
        // morning is, and the phone is the one standing in the kitchen. It is
        // captured quietly whenever settings are opened, so a baker who
        // travels keeps getting reminders at a sensible hour.
        const defaultReminders = { todosDaily: true, todosAt: '08:00', marketEve: true, marketAt: '18:00', timezone: 'UTC' };
        const savedReminders = (this.state.reminders && typeof this.state.reminders === 'object')
          ? this.state.reminders
          : defaultReminders;
        const phoneZone = (() => {
          try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (error) { return 'UTC'; }
        })();
        const reminders = { ...defaultReminders, ...savedReminders, timezone: phoneZone };
        if (!this.__baketlyZoneChecked && savedReminders.timezone !== phoneZone) {
          this.__baketlyZoneChecked = true;
          window.setTimeout(() => this.setState({ reminders }), 0);
        }
        const setReminders = patch => this.setState(st => ({
          reminders: { ...defaultReminders, ...(st.reminders || {}), ...patch, timezone: phoneZone }
        }));
        // 6am to 10pm in half hours: the span a baker's day actually covers
        const timeChoices = [];
        for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += 30) {
          const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
          const minute = String(minutes % 60).padStart(2, '0');
          const value = hour + ':' + minute;
          const hour12 = ((Math.floor(minutes / 60) + 11) % 12) + 1;
          timeChoices.push({ value, label: hour12 + ':' + minute + (minutes < 12 * 60 ? 'am' : 'pm') });
        }

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
          billingChip: chip('billing'),

          remindTodos: reminders.todosDaily === true,
          toggleRemindTodos: () => setReminders({ todosDaily: !reminders.todosDaily }),
          remindTodosBg: reminders.todosDaily ? 'var(--color-accent)' : 'var(--color-neutral-300)',
          remindTodosKnob: reminders.todosDaily ? '22px' : '2px',
          todosAt: reminders.todosAt,
          setTodosAt: e => setReminders({ todosAt: e.target.value }),

          remindMarket: reminders.marketEve === true,
          toggleRemindMarket: () => setReminders({ marketEve: !reminders.marketEve }),
          remindMarketBg: reminders.marketEve ? 'var(--color-accent)' : 'var(--color-neutral-300)',
          remindMarketKnob: reminders.marketEve ? '22px' : '2px',
          marketAt: reminders.marketAt,
          setMarketAt: e => setReminders({ marketAt: e.target.value }),

          reminderTimes: timeChoices,
          reminderZoneLabel: 'Times are in ' + phoneZone.replace(/_/g, ' ') + ', from this phone.'
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

/** Shared with Home, so the button and the tab it opens match. */
export const SETTINGS_GEAR =
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
    ${sectionTab("pickGeneral", "generalChip", "General", SETTINGS_GEAR)}
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
      <div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;padding:13px 14px;margin-top:6px">
        <div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">Reminders</div>
        <div class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">What Baketly may remind you about, and when.</div>

        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--color-divider)">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px">What's on today's list</div>
            <div class="text-muted" style="font-size:11px">A morning nudge on days that have to-dos</div>
          </div>
          <button sc-camel-on-click="{{ toggleRemindTodos }}" aria-label="Remind me about to-dos" style="flex:none;position:relative;width:44px;height:26px;border-radius:999px;border:0;cursor:pointer;padding:0;background:{{ remindTodosBg }}">
            <span style="position:absolute;top:2px;left:{{ remindTodosKnob }};width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:var(--shadow-sm)"></span>
          </button>
        </div>
        <sc-if value="{{ remindTodos }}" hint-placeholder-val="{{ true }}">
          <div style="display:flex;align-items:center;gap:10px;padding:2px 0 10px">
            <span class="text-muted" style="font-size:12px;flex:1">Remind me at</span>
            <div class="an-select-wrap" style="display:block;margin:0;flex:none">
              <select class="an-select" value="{{ todosAt }}" sc-camel-on-change="{{ setTodosAt }}" aria-label="Time for the daily reminder">
                <sc-for list="{{ reminderTimes }}" as="slot" hint-placeholder-count="4">
                  <option value="{{ slot.value }}">{{ slot.label }}</option>
                </sc-for>
              </select>
            </div>
          </div>
        </sc-if>

        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--color-divider)">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px">A market tomorrow</div>
            <div class="text-muted" style="font-size:11px">The evening before, with what there is to bake</div>
          </div>
          <button sc-camel-on-click="{{ toggleRemindMarket }}" aria-label="Remind me before a market" style="flex:none;position:relative;width:44px;height:26px;border-radius:999px;border:0;cursor:pointer;padding:0;background:{{ remindMarketBg }}">
            <span style="position:absolute;top:2px;left:{{ remindMarketKnob }};width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:var(--shadow-sm)"></span>
          </button>
        </div>
        <sc-if value="{{ remindMarket }}" hint-placeholder-val="{{ true }}">
          <div style="display:flex;align-items:center;gap:10px;padding:2px 0 10px">
            <span class="text-muted" style="font-size:12px;flex:1">Remind me at</span>
            <div class="an-select-wrap" style="display:block;margin:0;flex:none">
              <select class="an-select" value="{{ marketAt }}" sc-camel-on-change="{{ setMarketAt }}" aria-label="Time for the market reminder">
                <sc-for list="{{ reminderTimes }}" as="slot" hint-placeholder-count="4">
                  <option value="{{ slot.value }}">{{ slot.label }}</option>
                </sc-for>
              </select>
            </div>
          </div>
        </sc-if>

        <div class="text-muted" style="font-size:11px;line-height:1.45;border-top:1px solid var(--color-divider);padding-top:8px">{{ reminderZoneLabel }} Reminders reach your phone once Baketly is installed as an app; in a browser tab they stay inside Baketly.</div>
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
