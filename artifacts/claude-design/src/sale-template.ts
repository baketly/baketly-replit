// Selling, either over the counter or at a market.
//
// Every sale used to be filed the same way: source 'pos', attached to nothing.
// A baker working a stall had no way to say which market a sale belonged to,
// so the takings never reached the event, and marking that market completed
// meant typing every quantity again from memory.
//
// Tapping New sale now asks which kind it is. Choose a market and the screen
// stays in that market until you leave it, each sale is filed against the
// event, and completing the market arrives with the quantities already filled
// in from what was actually rung up.

const saleController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const events = Array.isArray(this.state.eventRecords) ? this.state.eventRecords : [];
        const sales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords : [];
        const attachedTo = this.state.saleEventId || '';
        const attachedEvent = events.find(ev => ev.id === attachedTo) || null;

        const openSaleScreen = extra => this.setState(st => ({
          posQty: {}, posTendered: 0, posStage: 'idle', posPromo: 'none', posCustom: '',
          screen: 'sale', stack: [...st.stack, st.screen], sheet: false,
          saleModeOpen: false, saleEventPickerOpen: false,
          ...(extra || {})
        }));

        const upcomingForSale = events
          .filter(event => event.status === 'planned')
          .sort((a, b) => new Date(a.occurredAt || 0).getTime() - new Date(b.occurredAt || 0).getTime())
          .map(event => {
            const when = new Date(event.occurredAt || Date.now());
            const taken = sales
              .filter(sale => sale.eventId === event.id)
              .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
            return {
              name: event.name || 'Market',
              dateStr: isNaN(when.getTime()) ? '' : when.toLocaleString('en-US', { month: 'short', day: 'numeric' }),
              takenStr: taken > 0 ? CUR + taken.toFixed(2) + ' so far' : 'nothing rung up yet',
              choose: () => openSaleScreen({ saleEventId: event.id })
            };
          });

        return {
          saleTitle: attachedEvent ? 'Sale at ' + (attachedEvent.name || 'Market') : 'New sale',
          saleAttached: !!attachedEvent,
          saleAttachedName: attachedEvent ? (attachedEvent.name || 'Market') : '',

          // Attached to a market, Pay goes back to that market's till however
          // long you spend on other tabs. A market is a session, not a single
          // sale, and being asked again between every customer is the wrong
          // question. The tick in the corner is the way out.
          startSale: () => (attachedEvent
            ? openSaleScreen({})
            : this.setState({ saleModeOpen: true, saleEventPickerOpen: false })),
          // After charging, the next sale is the same kind as the one just
          // rung up — another customer at the same market, or another at the
          // counter. Asking again is a question already answered. The chooser
          // belongs to the Pay tab, where the decision is actually being made.
          saleAgain: () => openSaleScreen({}),

          saleModeOpen: this.state.saleModeOpen === true,
          closeSaleMode: e => { if (!e || e.target === e.currentTarget) this.setState({ saleModeOpen: false, saleEventPickerOpen: false }); },
          dismissSaleMode: () => this.setState({ saleModeOpen: false, saleEventPickerOpen: false }),
          chooseSingleSale: () => openSaleScreen({ saleEventId: '' }),
          chooseEventSale: () => this.setState({ saleModeOpen: false, saleEventPickerOpen: true }),

          saleEventPickerOpen: this.state.saleEventPickerOpen === true,
          closeSaleEventPicker: e => { if (!e || e.target === e.currentTarget) this.setState({ saleEventPickerOpen: false }); },
          dismissSaleEventPicker: () => this.setState({ saleEventPickerOpen: false }),
          saleEventOptions: upcomingForSale,
          saleHasUpcoming: upcomingForSale.length > 0,
          saleHasNoUpcoming: upcomingForSale.length === 0,
          saleNotAttached: !attachedEvent,
          // A shorter heading: "Sale at Riverside Night Market" at the size the
          // till uses for "New sale" took three lines and pushed everything down.
          saleTitleSize: attachedEvent ? '21px' : '28px',

          // Leaving the market and finishing it are the same act. Rather than
          // dropping you back at the counter, the tick carries what the till
          // took into the market's own results step, already counted, where it
          // can be corrected before the market is closed.
          finishSaleEvent: () => this.setState(st => {
            if (!attachedEvent) return { saleEventId: '' };
            const quantities = {};
            (attachedEvent.plannedItems || []).forEach(item => {
              quantities[item.productId] = item.quantity;
            });
            const sold = {};
            sales.filter(sale => sale.eventId === attachedEvent.id).forEach(sale =>
              (sale.lineItems || []).forEach(line => {
                sold[line.productId] = (sold[line.productId] || 0) + (Number(line.quantity) || 0);
              }));
            // something rung up but never planned for still needs a row to be
            // corrected in
            const picked = (attachedEvent.plannedItems || []).map(item => item.productId);
            Object.keys(sold).forEach(id => { if (picked.indexOf(id) === -1) picked.push(id); });
            return {
              saleEventId: '',
              screen: 'event',
              stack: [...st.stack, st.screen],
              eventCurrentId: attachedEvent.id,
              eventName: attachedEvent.name || 'Market',
              eventDate: (attachedEvent.occurredAt || '').slice(0, 10),
              eventBoothFee: Number(attachedEvent.boothFee) || 0,
              eventOtherCosts: (attachedEvent.otherCosts || []).map(cost => ({
                label: cost.label, amount: String(cost.amount)
              })),
              evPicked: picked,
              evQty: quantities,
              evSold: sold,
              evStatus: 'planned',
              evSaved: true,
              evEnteringResults: true,
              evPickerOpen: false,
              evPickerSel: [],
              eventDeleteOpen: false,
              shopNeed: {},
              shopNeedText: {}
            };
          }),
          leaveSaleEvent: () => this.setState({ saleEventId: '' }),

          // A market sale starts from what was planned for that market, so the
          // list is the few things on the table rather than the whole pantry.
          // The categories are what made a long list navigable and have nothing
          // left to do here.
          saleShowCats: !attachedEvent,
          saleLineupOnly: !!attachedEvent && !(this.state.posSearch || '').trim()
        };
      })(),
`;

/**
 * At a market the till lists what was baked for that market. Searching looks
 * past the van — someone always asks for the thing you did not plan for — so
 * anything in the pantry can still be rung up.
 */
function tillShowsTheLineup(template: string): string {
  const anchor =
    "const visible = posRecipes.filter(r => (posCat === 'all' || r.type === posCat) && (!posQ || r.name.toLowerCase().includes(posQ)));";
  if (!template.includes(anchor)) throw new Error("Missing till list anchor");
  return template.replace(
    anchor,
    () =>
      "const posLineup = (() => {\n" +
      "              const at = this.state.saleEventId || '';\n" +
      "              if (!at) return null;\n" +
      "              const ev = (this.state.eventRecords || []).find(e => e.id === at);\n" +
      "              const planned = ev && Array.isArray(ev.plannedItems) ? ev.plannedItems : [];\n" +
      "              if (!planned.length) return null;\n" +
      "              const ids = {};\n" +
      "              planned.forEach(item => { if (item && item.productId) ids[item.productId] = true; });\n" +
      "              return ids;\n" +
      "            })();\n" +
      "            const visible = posRecipes.filter(r => (posCat === 'all' || r.type === posCat)\n" +
      "              && (posQ ? r.name.toLowerCase().includes(posQ) : (!posLineup || posLineup[r.id])));",
  );
}

/** The category chips only earn their room on a list of everything. */
function tillHidesCategories(template: string): string {
  const anchor =
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;overflow-x:auto;scrollbar-width:none">\n    <sc-for list="{{ posCats }}" as="f" hint-placeholder-count="5">';
  if (!template.includes(anchor)) throw new Error("Missing till categories anchor");
  return template.replace(
    anchor,
    () =>
      '<sc-if value="{{ saleLineupOnly }}" hint-placeholder-val="{{ false }}">' +
      '<p class="text-muted" style="font-size:12px;line-height:1.5;margin:0 0 8px">' +
      'What you planned to bake for {{ saleAttachedName }}. Search to ring up anything else.</p></sc-if>' +
      '<sc-if value="{{ saleShowCats }}" hint-placeholder-val="{{ true }}">' +
      anchor,
  );
}

function addSaleController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable sale anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${saleController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** The heading says which market you are selling at, and how to finish it. */
function bindSaleTitle(template: string): string {
  const anchor =
    '<div style="display:flex;justify-content:space-between;align-items:baseline">\n' +
    '    <h2 style="font-size:28px;margin:6px 0 2px">New sale</h2>\n' +
    '    <span class="text-muted" style="font-size:12px;font-feature-settings:\'tnum\'">{{ todayLabel }}</span>\n' +
    "  </div>";
  if (!template.includes(anchor)) throw new Error("Missing sale header anchor");
  return template.replace(
    anchor,
    () =>
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
      '<div style="flex:1;min-width:0">' +
      '<h2 style="font-size:{{ saleTitleSize }};line-height:1.18;margin:6px 0 2px">{{ saleTitle }}</h2>' +
      '<span class="text-muted" style="font-size:12px;font-feature-settings:\'tnum\'">{{ todayLabel }}</span>' +
      "</div>" +
      '<sc-if value="{{ saleAttached }}" hint-placeholder-val="{{ false }}">' +
      '<button sc-camel-on-click="{{ finishSaleEvent }}" aria-label="Finish this market" ' +
      'style="flex:none;width:40px;height:40px;margin-top:6px;border-radius:50%;border:0;' +
      'background:var(--color-accent);color:#fff;display:grid;place-items:center;cursor:pointer;' +
      'padding:0;box-shadow:var(--shadow-sm)">' +
      '<svg width="21" height="21" sc-camel-view-box="0 0 24 24" fill="none" stroke="#fff" ' +
      'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>' +
      "</button></sc-if></div>",
  );
}

/** Both entry points go through the chooser rather than straight to the till. */
function routeSaleEntryPoints(template: string): string {
  const tabButton = '<button sc-camel-on-click="{{ goSale }}" aria-label="New sale"';
  const doneButton =
    '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ goSale }}" style="min-height:52px;margin-bottom:10px">New sale</button>';
  if (!template.includes(tabButton)) throw new Error("Missing sale tab button anchor");
  if (!template.includes(doneButton)) throw new Error("Missing sale done button anchor");
  // At a market the next thing you do is serve the next customer, so Done —
  // which walks away from the market — is only offered on a counter sale.
  const doneGhost =
    '<button class="btn btn-ghost btn-block" sc-camel-on-click="{{ goDash }}" style="min-height:48px">Done</button>';
  if (!template.includes(doneGhost)) throw new Error("Missing sale done ghost anchor");
  return template
    .replace(tabButton, () => '<button sc-camel-on-click="{{ startSale }}" aria-label="New sale"')
    .replace(
      doneButton,
      () =>
        '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ saleAgain }}" style="min-height:52px;margin-bottom:10px">New sale</button>',
    )
    .replace(
      doneGhost,
      () =>
        '<sc-if value="{{ saleNotAttached }}" hint-placeholder-val="{{ true }}">' + doneGhost + "</sc-if>",
    );
}

const chooserMarkup = `<sc-if value="{{ saleModeOpen }}" hint-placeholder-val="{{ false }}">
<div sc-camel-on-click="{{ closeSaleMode }}" style="position:absolute;inset:0;background:color-mix(in srgb,var(--color-neutral-900) 45%,transparent);display:flex;align-items:center;justify-content:center;padding:18px;z-index:45">
  <div style="width:min(100%, 380px);background:var(--color-bg);border:1px solid var(--color-divider);border-radius:20px;padding:20px;box-shadow:var(--shadow-lg);box-sizing:border-box">
    <h4 style="margin-bottom:4px">New sale</h4>
    <p class="text-muted" style="font-size:13px;margin-bottom:14px">Is this a counter sale, or one at a market?</p>
    <div style="display:flex;gap:10px">
      <button sc-camel-on-click="{{ chooseSingleSale }}" style="flex:1;min-height:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px 10px;border:1px solid var(--color-divider);border-radius:16px;background:#fff;cursor:pointer;font-family:var(--font-body)">
        <svg width="24" height="24" sc-camel-view-box="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12l1 7H5z"></path><path d="M5 9v11h14V9"></path><path d="M10 20v-6h4v6"></path></svg>
        <span style="font-size:14px;font-weight:600">Single sale</span>
        <span class="text-muted" style="font-size:11px;line-height:1.35;text-align:center">Counts towards your month</span>
      </button>
      <button sc-camel-on-click="{{ chooseEventSale }}" style="flex:1;min-height:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px 10px;border:1px solid var(--color-accent);border-radius:16px;background:var(--color-accent-100);cursor:pointer;font-family:var(--font-body)">
        <svg width="24" height="24" sc-camel-view-box="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"></path><path d="M5 7V5h14v2"></path><path d="M4 7l1 13h14l1-13"></path><path d="M9 12h6"></path></svg>
        <span style="font-size:14px;font-weight:600">Attach to event</span>
        <span class="text-muted" style="font-size:11px;line-height:1.35;text-align:center">Files against a market you have planned</span>
      </button>
    </div>
  </div>
</div>
</sc-if>
<sc-if value="{{ saleEventPickerOpen }}" hint-placeholder-val="{{ false }}">
<div sc-camel-on-click="{{ closeSaleEventPicker }}" style="position:absolute;inset:0;background:color-mix(in srgb,var(--color-neutral-900) 45%,transparent);display:flex;align-items:center;justify-content:center;padding:18px;z-index:46">
  <div style="width:min(100%, 380px);max-height:78%;display:flex;flex-direction:column;background:var(--color-bg);border:1px solid var(--color-divider);border-radius:20px;padding:20px;box-shadow:var(--shadow-lg);box-sizing:border-box">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex:none">
      <h4>Which market?</h4>
      <button sc-camel-on-click="{{ dismissSaleEventPicker }}" aria-label="Close market picker" style="width:30px;height:30px;border:0;background:transparent;color:var(--color-text);font-size:24px;line-height:1;cursor:pointer">×</button>
    </div>
    <p class="text-muted" style="font-size:13px;margin-bottom:10px;flex:none">Every sale you ring up will be filed against it.</p>
    <div style="flex:1;overflow:auto;min-height:0;display:flex;flex-direction:column">
      <sc-if value="{{ saleHasNoUpcoming }}" hint-placeholder-val="{{ false }}">
        <div class="text-muted" style="font-size:13px;padding:14px 4px">No markets planned yet. Plan one under Markets and it will show up here.</div>
      </sc-if>
      <sc-for list="{{ saleEventOptions }}" as="se" hint-placeholder-count="2">
        <div class="bk-row" sc-camel-on-click="{{ se.choose }}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 4px;border-top:1px solid var(--color-divider);cursor:pointer;min-height:44px">
          <span style="min-width:0">
            <span style="font-size:14px;display:block">{{ se.name }}</span>
            <span class="text-muted" style="font-size:11px">{{ se.dateStr }} · {{ se.takenStr }}</span>
          </span>
          <span class="text-muted" style="font-size:18px;flex:none">›</span>
        </div>
      </sc-for>
    </div>
  </div>
</div>
</sc-if>
`;

/** Both dialogs live at the end of the sale screen, above the tab bar. */
/** Closes the block the categories were wrapped in. */
function closeCategoryBlock(template: string): string {
  const anchor = '    </sc-for>\n  </div>\n  <div style="flex:1;display:flex;flex-direction:column">\n    <sc-for list="{{ posProducts }}" as="p" hint-placeholder-count="8">';
  if (!template.includes(anchor)) throw new Error("Missing till list close anchor");
  return template.replace(
    anchor,
    () => '    </sc-for>\n  </div></sc-if>\n  <div style="flex:1;display:flex;flex-direction:column">\n    <sc-for list="{{ posProducts }}" as="p" hint-placeholder-count="8">',
  );
}

function addSaleDialogs(template: string): string {
  const anchor = '<sc-if value="{{ tabsVisible }}" hint-placeholder-val="{{ true }}">';
  if (!template.includes(anchor)) throw new Error("Missing tab bar anchor");
  return template.replace(anchor, () => chooserMarkup + anchor);
}

/** A sale rung up at a market belongs to that market. */
function fileSaleAgainstEvent(template: string): string {
  const anchor =
    "{ id: 'sale-pos-' + Date.now().toString(36), occurredAt: new Date().toISOString(), source: 'pos', total: final,";
  if (!template.includes(anchor)) throw new Error("Missing pos sale record anchor");
  return template.replace(
    anchor,
    () =>
      "{ id: 'sale-pos-' + Date.now().toString(36), occurredAt: new Date().toISOString(), source: st.saleEventId ? 'event' : (String(method).toLowerCase() === 'cash' ? 'cash' : 'pos'), ...(st.saleEventId ? { eventId: st.saleEventId } : {}), total: final,",
  );
}

export function applySaleBehavior(template: string): string {
  let out = addSaleController(template);
  out = tillShowsTheLineup(out);
  out = closeCategoryBlock(tillHidesCategories(out));
  return fileSaleAgainstEvent(addSaleDialogs(routeSaleEntryPoints(bindSaleTitle(out))));
}
