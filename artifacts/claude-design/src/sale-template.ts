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

          // the tab bar always asks, so there is a way back out of a market
          startSale: () => this.setState({ saleModeOpen: true, saleEventPickerOpen: false }),
          // after charging, carrying on at the same market is the common case
          saleAgain: () => (attachedEvent ? openSaleScreen({}) : this.setState({ saleModeOpen: true, saleEventPickerOpen: false })),

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
          leaveSaleEvent: () => this.setState({ saleEventId: '' })
        };
      })(),
`;

function addSaleController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable sale anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${saleController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** The heading says which market you are selling at. */
function bindSaleTitle(template: string): string {
  const anchor = '<h2 style="font-size:28px;margin:6px 0 2px">New sale</h2>';
  if (!template.includes(anchor)) throw new Error("Missing sale title anchor");
  return template.replace(
    anchor,
    () =>
      '<h2 style="font-size:28px;margin:6px 0 2px">{{ saleTitle }}</h2>' +
      '<sc-if value="{{ saleAttached }}" hint-placeholder-val="{{ false }}">' +
      '<button class="btn btn-ghost" sc-camel-on-click="{{ leaveSaleEvent }}" style="min-height:32px;padding:2px 8px;font-size:12px;margin:0 0 2px -6px">Leave this market</button>' +
      "</sc-if>",
  );
}

/** Both entry points go through the chooser rather than straight to the till. */
function routeSaleEntryPoints(template: string): string {
  const tabButton = '<button sc-camel-on-click="{{ goSale }}" aria-label="New sale"';
  const doneButton =
    '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ goSale }}" style="min-height:52px;margin-bottom:10px">New sale</button>';
  if (!template.includes(tabButton)) throw new Error("Missing sale tab button anchor");
  if (!template.includes(doneButton)) throw new Error("Missing sale done button anchor");
  return template
    .replace(tabButton, () => '<button sc-camel-on-click="{{ startSale }}" aria-label="New sale"')
    .replace(
      doneButton,
      () =>
        '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ saleAgain }}" style="min-height:52px;margin-bottom:10px">New sale</button>',
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
      "{ id: 'sale-pos-' + Date.now().toString(36), occurredAt: new Date().toISOString(), source: st.saleEventId ? 'event' : 'pos', ...(st.saleEventId ? { eventId: st.saleEventId } : {}), total: final,",
  );
}

export function applySaleBehavior(template: string): string {
  return fileSaleAgainstEvent(
    addSaleDialogs(routeSaleEntryPoints(bindSaleTitle(addSaleController(template)))),
  );
}
