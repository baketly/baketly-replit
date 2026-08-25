// Planning a market, and what happens to it afterwards.
//
// The mockup had one event that never really existed: its product lineup was a
// fixed list of five products from the page's own metadata, and the only way to
// create a record was "Update Revenue & Save", which wrote a completed event.
// There was no way to save a market you had merely planned, no way to delete
// one, and "Mark completed" sat on the screen even while creating a new event.
//
// The lifecycle now is: build a lineup from your own recipes, Save event to
// keep it as upcoming, Mark completed when it is over — which asks what
// actually sold before moving it to Past events — and Delete with a
// confirmation at any point.

const eventController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const recipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const events = Array.isArray(this.state.eventRecords) ? this.state.eventRecords : [];
        const picked = Array.isArray(this.state.evPicked) ? this.state.evPicked : [];
        const eventId = this.state.eventCurrentId || '';
        const saved = events.find(ev => ev.id === eventId) || null;

        const unitCost = recipe => {
          const made = Math.max(1, Number(recipe.yield) || 1);
          const ingredients = (recipe.ingredientKeys || []).reduce(
            (sum, key) => sum + (Number((recipe.amounts || {})[key]) || 0) * ((this.ING_META[key] && Number(this.ING_META[key].per)) || 0), 0);
          const packaging = (recipe.packagingKeys || []).reduce(
            (sum, key) => sum + ((this.PACK_META[key] && Number(this.PACK_META[key].per)) || 0), 0);
          return ingredients / made + packaging;
        };

        // ---- the picker ------------------------------------------------
        const staged = Array.isArray(this.state.evPickerSel) ? this.state.evPickerSel : [];
        const available = recipes.filter(recipe => !picked.includes(recipe.id));
        const pickerItems = available.map(recipe => ({
          name: recipe.name || 'Untitled recipe',
          meta: CUR + (Number(recipe.price) || 0).toFixed(2) + ' · costs ' + CUR + unitCost(recipe).toFixed(2),
          check: staged.includes(recipe.id) ? '✓' : '',
          rowBg: staged.includes(recipe.id) ? 'var(--color-accent-100)' : '#fff',
          toggle: () => this.setState(st => {
            const current = Array.isArray(st.evPickerSel) ? st.evPickerSel : [];
            return { evPickerSel: current.includes(recipe.id)
              ? current.filter(id => id !== recipe.id)
              : [...current, recipe.id] };
          })
        }));

        // ---- saving ----------------------------------------------------
        const plannedFrom = st => (Array.isArray(st.evPicked) ? st.evPicked : []).map(id => {
          const recipe = recipes.find(r => r.id === id);
          if (!recipe) return null;
          return {
            productId: recipe.id,
            name: recipe.name || 'Untitled recipe',
            quantity: Math.max(0, Math.round(Number((st.evQty || {})[id]) || 0))
          };
        }).filter(item => item && item.quantity > 0);

        const costsFrom = st => (Array.isArray(st.eventOtherCosts) ? st.eventOtherCosts : [])
          .map(cost => ({
            label: String((cost && cost.label) || '').trim().slice(0, 60) || 'Other cost',
            amount: Math.max(0, Number(cost && cost.amount) || 0)
          }))
          .filter(cost => cost.amount > 0);

        const recordFrom = (st, status) => {
          const day = st.eventDate || new Date().toISOString().slice(0, 10);
          const plannedItems = plannedFrom(st);
          const otherCosts = costsFrom(st);
          return {
            id: st.eventCurrentId,
            name: String(st.eventName || '').trim().slice(0, 160) || 'Market',
            occurredAt: day + 'T12:00:00.000Z',
            boothFee: Math.max(0, Number(st.eventBoothFee) || 0),
            status,
            // every event record carries a line-item list; a market that has
            // only been planned simply has nothing in it yet
            lineItems: (saved && Array.isArray(saved.lineItems)) ? saved.lineItems : [],
            ...(otherCosts.length ? { otherCosts } : {}),
            ...(plannedItems.length ? { plannedItems } : {})
          };
        };

        const saveWith = (status, extra) => this.setState(st => {
          const event = recordFrom(st, status);
          return {
            eventRecords: [...(st.eventRecords || []).filter(e => e.id !== event.id), event],
            evSaved: true,
            ...(extra || {})
          };
        });

        // ---- completing -------------------------------------------------
        const entering = this.state.evEnteringResults === true;
        const completed = (saved && saved.status === 'completed') || this.state.evStatus === 'completed';

        const confirmCompleted = () => this.setState(st => {
          const event = recordFrom(st, 'completed');
          const day = event.occurredAt;
          const lines = (Array.isArray(st.evPicked) ? st.evPicked : []).map(id => {
            const recipe = recipes.find(r => r.id === id);
            const quantity = Math.max(0, Math.round(Number((st.evSold || {})[id]) || 0));
            if (!recipe || quantity <= 0) return null;
            return {
              productId: recipe.id,
              name: recipe.name || 'Untitled recipe',
              quantity,
              unitPrice: Number(recipe.price) || 0,
              unitCost: unitCost(recipe)
            };
          }).filter(Boolean);
          const saleId = 'sale-' + event.id + '-direct';
          const others = (st.saleRecords || []).filter(sale => sale.id !== saleId);
          const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
          return {
            eventRecords: [...(st.eventRecords || []).filter(e => e.id !== event.id), event],
            saleRecords: lines.length ? [...others, { id: saleId, occurredAt: day, source: 'event', eventId: event.id, total, lineItems: lines }] : others,
            evSaved: true,
            evStatus: 'completed',
            evEnteringResults: false,
            screen: 'markets',
            stack: []
          };
        });

        // ---- the upcoming list on Markets --------------------------------
        const openSaved = event => () => this.setState(st => {
          const quantities = {};
          (event.plannedItems || []).forEach(item => { quantities[item.productId] = item.quantity; });
          return {
            screen: 'event',
            stack: [...st.stack, st.screen],
            eventCurrentId: event.id,
            eventName: event.name || 'Market',
            eventDate: (event.occurredAt || '').slice(0, 10),
            eventBoothFee: Number(event.boothFee) || 0,
            eventOtherCosts: (event.otherCosts || []).map(cost => ({ label: cost.label, amount: String(cost.amount) })),
            evPicked: (event.plannedItems || []).map(item => item.productId),
            evQty: quantities,
            evSold: {},
            evStatus: event.status === 'completed' ? 'completed' : 'planned',
            evSaved: true,
            evEnteringResults: false,
            evPickerOpen: false,
            evPickerSel: [],
            eventDeleteOpen: false
          };
        });

        // An event with no status predates this screen; those all have sales
        // behind them, so they belong in the history rather than the plan.
        const upcoming = events
          .filter(event => event.status === 'planned')
          .sort((a, b) => new Date(a.occurredAt || 0).getTime() - new Date(b.occurredAt || 0).getTime())
          .map(event => {
            const when = new Date(event.occurredAt || Date.now());
            const items = (event.plannedItems || []).length;
            const goal = (event.plannedItems || []).reduce((sum, item) => {
              const recipe = recipes.find(r => r.id === item.productId);
              return sum + (recipe ? (Number(recipe.price) || 0) * item.quantity : 0);
            }, 0);
            return {
              monthStr: isNaN(when.getTime()) ? '' : when.toLocaleString('en-US', { month: 'short' }),
              dayStr: isNaN(when.getTime()) ? '' : String(when.getDate()),
              name: event.name || 'Market',
              subStr: items + (items === 1 ? ' product' : ' products') + ' · booth ' + CUR + (Number(event.boothFee) || 0).toFixed(2),
              revStr: CUR + Math.round(goal).toLocaleString('en-US'),
              open: openSaved(event)
            };
          });

        return {
          evPickerOpen: this.state.evPickerOpen === true,
          openEvPicker: () => this.setState({ evPickerOpen: true, evPickerSel: [] }),
          closeEvPicker: () => this.setState({ evPickerOpen: false, evPickerSel: [] }),
          evPickerItems: pickerItems,
          evPickerHasItems: pickerItems.length > 0,
          evPickerEmpty: pickerItems.length === 0,
          evPickerEmptyText: recipes.length === 0
            ? 'No recipes yet. Add one in the Pantry and it will show up here.'
            : 'Every recipe is already in this lineup.',
          evPickerAddLabel: staged.length === 1 ? 'Add 1 product' : 'Add ' + staged.length + ' products',
          evPickerCanAdd: staged.length > 0,
          addPickedRecipes: () => this.setState(st => ({
            evPicked: [...(Array.isArray(st.evPicked) ? st.evPicked : []), ...(Array.isArray(st.evPickerSel) ? st.evPickerSel : [])],
            evPickerOpen: false,
            evPickerSel: []
          })),
          evLineupEmpty: picked.length === 0,

          evSaveLabel: this.state.evSaved === true ? 'Save changes' : 'Save event',
          saveEventNow: () => saveWith(completed ? 'completed' : 'planned', { screen: 'markets', stack: [] }),

          // only offered once the market exists and is still ahead of you
          evCanComplete: !!saved && saved.status === 'planned' && !entering,
          startCompleting: () => this.setState({ evEnteringResults: true }),
          evEnteringResults: entering,
          evNotEnteringResults: !entering,
          cancelCompleting: () => this.setState({ evEnteringResults: false }),
          confirmCompleted,

          evCanDelete: !!saved,
          eventDeleteOpen: this.state.eventDeleteOpen === true,
          askDeleteEvent: () => this.setState({ eventDeleteOpen: true }),
          cancelDeleteEvent: () => this.setState({ eventDeleteOpen: false }),
          eventDeleteName: (saved && saved.name) || 'this event',
          confirmDeleteEvent: () => this.setState(st => ({
            eventRecords: (st.eventRecords || []).filter(e => e.id !== st.eventCurrentId),
            saleRecords: (st.saleRecords || []).filter(sale => sale.eventId !== st.eventCurrentId),
            eventDeleteOpen: false,
            evSaved: false,
            screen: 'markets',
            stack: []
          })),

          upcomingEvents: upcoming,
          hasUpcomingEvents: upcoming.length > 0,
          hasNoUpcomingEvents: upcoming.length === 0
        };
      })(),
`;

function addEventController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable event anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${eventController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** The lineup is built from the baker's recipes rather than a fixed list. */
function addLineupPicker(template: string): string {
  const anchor =
    '    </sc-for>\n  </div>\n  <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--color-divider);border-radius:var(--radius-md);background:#fff;margin-bottom:6px">';
  if (!template.includes(anchor)) throw new Error("Missing event lineup anchor");
  return template.replace(
    anchor,
    () =>
      '    </sc-for>\n' +
      '    <sc-if value="{{ evLineupEmpty }}" hint-placeholder-val="{{ false }}">\n' +
      '      <div class="text-muted" style="padding:16px 0;font-size:13px;border-top:1px solid var(--color-divider)">Nothing planned yet. Add the products you mean to bake for this market.</div>\n' +
      "    </sc-if>\n" +
      "  </div>\n" +
      '  <button class="btn btn-secondary btn-block" sc-camel-on-click="{{ openEvPicker }}" style="min-height:44px;margin-bottom:14px">+ Add from recipes</button>\n' +
      '  <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--color-divider);border-radius:var(--radius-md);background:#fff;margin-bottom:6px">',
  );
}

const pickerMarkup = `<sc-if value="{{ evPickerOpen }}" hint-placeholder-val="{{ false }}">
<div style="position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(38,34,28,0.38)">
  <div style="width:100%;max-width:520px;max-height:82vh;display:flex;flex-direction:column;background:var(--color-bg);border-radius:20px 20px 0 0;padding:18px 20px 22px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <h6 style="margin:0">Add from recipes</h6>
      <button class="btn btn-ghost" sc-camel-on-click="{{ closeEvPicker }}" style="min-height:40px;padding:4px 10px">×</button>
    </div>
    <p class="text-muted" style="font-size:12px;margin-bottom:10px">Pick what you plan to bake. You set the quantities next.</p>
    <div style="flex:1;overflow:auto;min-height:0;margin-bottom:12px">
      <sc-if value="{{ evPickerEmpty }}" hint-placeholder-val="{{ false }}">
        <div class="text-muted" style="font-size:13px;padding:14px 0">{{ evPickerEmptyText }}</div>
      </sc-if>
      <sc-for list="{{ evPickerItems }}" as="pick" hint-placeholder-count="3">
        <div class="bk-row" sc-camel-on-click="{{ pick.toggle }}" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--color-divider);border-radius:12px;margin-bottom:8px;cursor:pointer;background:{{ pick.rowBg }}">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px">{{ pick.name }}</div>
            <div class="text-muted" style="font-size:11px;font-feature-settings:'tnum'">{{ pick.meta }}</div>
          </div>
          <span style="flex:none;color:var(--color-accent-700);font-weight:600">{{ pick.check }}</span>
        </div>
      </sc-for>
    </div>
    <sc-if value="{{ evPickerCanAdd }}" hint-placeholder-val="{{ false }}">
      <button class="btn btn-primary btn-block" sc-camel-on-click="{{ addPickedRecipes }}" style="min-height:48px">{{ evPickerAddLabel }}</button>
    </sc-if>
  </div>
</div>
</sc-if>
`;

const deleteDialogMarkup = `<sc-if value="{{ eventDeleteOpen }}" hint-placeholder-val="{{ false }}">
<div style="position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(38,34,28,0.38)">
  <div style="width:100%;max-width:360px;background:var(--color-bg);border-radius:18px;padding:20px">
    <h6 style="margin:0 0 6px">Delete this event?</h6>
    <p style="font-size:14px;line-height:1.5;margin-bottom:16px">{{ eventDeleteName }} and any sales recorded against it will be removed. This cannot be undone.</p>
    <div style="display:flex;gap:10px">
      <button class="btn btn-secondary" sc-camel-on-click="{{ cancelDeleteEvent }}" style="flex:1;min-height:46px">Keep it</button>
      <button class="btn btn-primary" sc-camel-on-click="{{ confirmDeleteEvent }}" style="flex:1;min-height:46px;background:#b0563e;border-color:#b0563e">Delete</button>
    </div>
  </div>
</div>
</sc-if>
`;

/**
 * One button while planning. "Mark completed" appears only for a market that
 * has been saved and has not happened yet, and it asks what sold before the
 * event moves into the history.
 */
function replaceEventButtons(template: string): string {
  const anchor =
    '  <sc-if value="{{ evPlanned }}" hint-placeholder-val="{{ true }}">\n    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ markCompleted }}" style="min-height:48px">Mark completed</button>\n  </sc-if>';
  if (!template.includes(anchor)) throw new Error("Missing mark-completed anchor");
  return template.replace(
    anchor,
    () =>
      '  <sc-if value="{{ evEnteringResults }}" hint-placeholder-val="{{ false }}">\n' +
      '    <h6 style="margin:6px 0 4px">What actually sold?</h6>\n' +
      '    <p class="text-muted" style="font-size:12px;margin-bottom:10px">Enter the quantities you sold. Leave a product at zero if none went.</p>\n' +
      '    <div style="display:flex;flex-direction:column;margin-bottom:14px;border-bottom:1px solid var(--color-divider)">\n' +
      '      <sc-for list="{{ evLineup }}" as="p" hint-placeholder-count="3">\n' +
      '        <div style="display:grid;grid-template-columns:1fr 76px;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--color-divider)">\n' +
      '          <span style="font-size:13px">{{ p.name }}</span>\n' +
      '          <input class="input" value="{{ p.sold }}" sc-camel-on-change="{{ p.setSold }}" placeholder="sold" style="padding:7px 8px;text-align:right;font-feature-settings:\'tnum\';font-size:13px;border-radius:12px">\n' +
      "        </div>\n" +
      "      </sc-for>\n" +
      "    </div>\n" +
      '    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ confirmCompleted }}" style="min-height:48px;margin-bottom:10px">Complete event</button>\n' +
      '    <button class="btn btn-ghost btn-block" sc-camel-on-click="{{ cancelCompleting }}" style="min-height:44px;margin-bottom:14px">Cancel</button>\n' +
      "  </sc-if>\n" +
      '  <sc-if value="{{ evNotEnteringResults }}" hint-placeholder-val="{{ true }}">\n' +
      '  <button class="btn btn-primary btn-block" sc-camel-on-click="{{ saveEventNow }}" style="min-height:48px;margin-bottom:10px">{{ evSaveLabel }}</button>\n' +
      '  <sc-if value="{{ evCanComplete }}" hint-placeholder-val="{{ false }}">\n' +
      '    <button class="btn btn-secondary btn-block" sc-camel-on-click="{{ startCompleting }}" style="min-height:46px;margin-bottom:10px">Mark completed</button>\n' +
      "  </sc-if>\n" +
      '  <sc-if value="{{ evCanDelete }}" hint-placeholder-val="{{ false }}">\n' +
      '    <button class="btn btn-ghost btn-block" sc-camel-on-click="{{ askDeleteEvent }}" style="min-height:44px;color:#b0563e">Delete event</button>\n' +
      "  </sc-if>\n" +
      "  </sc-if>\n" +
      pickerMarkup +
      deleteDialogMarkup,
  );
}

/** The old completed-only block duplicated what the flow above now covers. */
function removeLegacyCompletedBlock(template: string): string {
  const start = template.indexOf('<sc-if value="{{ evCompleted }}"');
  if (start === -1) throw new Error("Missing legacy completed block");
  const innerStart = template.indexOf(">", start) + 1;
  let depth = 1;
  let cursor = innerStart;
  while (depth > 0) {
    const nextOpen = template.indexOf("<sc-if", cursor);
    const nextClose = template.indexOf("</sc-if>", cursor);
    if (nextClose === -1) throw new Error("Unclosed legacy completed block");
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 6;
    } else {
      depth -= 1;
      if (depth === 0) return template.slice(0, start) + template.slice(nextClose + 8);
      cursor = nextClose + 8;
    }
  }
  throw new Error("Unclosed legacy completed block");
}

/** The Upcoming list on Markets, from the events actually saved as planned. */
function replaceUpcomingList(template: string): string {
  const startMarker = '<h6 style="margin-bottom:8px">Upcoming</h6>';
  const endMarker = '  <h6 style="margin-bottom:8px">Past events</h6>';
  const altEnd = "  <div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:2px\">\n    <h6 style=\"margin:0\">Past events</h6>";
  const start = template.indexOf(startMarker);
  if (start === -1) throw new Error("Missing upcoming section anchor");
  let end = template.indexOf(endMarker, start);
  if (end === -1) end = template.indexOf(altEnd, start);
  if (end === -1) throw new Error("Missing past-events boundary");
  const markup =
    '<h6 style="margin-bottom:8px">Upcoming</h6>\n' +
    '  <div style="display:flex;flex-direction:column;margin-bottom:20px">\n' +
    '    <sc-for list="{{ upcomingEvents }}" as="ue" hint-placeholder-count="1">\n' +
    '      <div class="bk-row" sc-camel-on-click="{{ ue.open }}" style="display:flex;align-items:center;gap:14px;padding:14px 0;border-top:1px solid var(--color-divider);cursor:pointer">\n' +
    '        <div style="text-align:center;flex:none;width:44px"><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-accent)">{{ ue.monthStr }}</div><div style="font-family:var(--font-heading);font-weight:600;font-size:22px;line-height:1;font-feature-settings:\'tnum\'">{{ ue.dayStr }}</div></div>\n' +
    '        <div style="flex:1;min-width:0"><div style="font-family:var(--font-heading);font-weight:600;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ ue.name }}</div><div class="text-muted" style="font-size:12px">{{ ue.subStr }}</div></div>\n' +
    '        <div style="text-align:right;flex:none"><div style="font-feature-settings:\'tnum\';font-size:15px">{{ ue.revStr }}</div><div class="text-muted" style="font-size:11px">est. revenue</div></div>\n' +
    "      </div>\n" +
    "    </sc-for>\n" +
    '    <sc-if value="{{ hasNoUpcomingEvents }}" hint-placeholder-val="{{ false }}">\n' +
    '      <div class="text-muted" style="padding:16px 0;font-size:13px;border-top:1px solid var(--color-divider)">No markets planned yet. Tap + New event to plan one.</div>\n' +
    "    </sc-if>\n" +
    "  </div>\n";
  return template.slice(0, start) + markup + template.slice(end);
}

/** A new event starts with an empty lineup and nothing saved. */
function resetDraftOnNewEvent(template: string): string {
  const anchor = "evQty: {}, evSold: {}, evStatus: 'planned', evSaved: false, actualRev: 0, soldRev: 0, cashQty: {}, cashPaid: '', cashOrdersArr: [], screen: 'event', stack: st.stack }))";
  if (!template.includes(anchor)) throw new Error("Missing new-event reset anchor");
  return template.replace(
    anchor,
    () =>
      "evQty: {}, evSold: {}, evStatus: 'planned', evSaved: false, actualRev: 0, soldRev: 0, cashQty: {}, cashPaid: '', cashOrdersArr: [], evPicked: [], evPickerOpen: false, evPickerSel: [], evEnteringResults: false, eventDeleteOpen: false, screen: 'event', stack: st.stack }))",
  );
}

export function applyEventBehavior(template: string): string {
  let out = addEventController(template);
  out = addLineupPicker(out);
  out = replaceEventButtons(out);
  out = removeLegacyCompletedBlock(out);
  out = replaceUpcomingList(out);
  return resetDraftOnNewEvent(out);
}
