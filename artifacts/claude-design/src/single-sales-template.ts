// Counter sales, listed where the rest of the month is reported.
//
// Analytics could tell you what a market took, because a market is a thing
// with a page of its own. A sale rung up over the counter vanished into the
// month's totals — countable, but never listed, so there was no way to see
// what any single one of them actually was.
//
// A month's breakdown now lists them, newest first, one line each, beside the
// products and markets that made up the same month. Tapping a line opens what
// was in it.

const singleSalesController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const sales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords : [];
        const now = new Date();
        const monthKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        const selected = this.state.analyticsMonth || monthKey(now);
        const openId = this.state.openSaleId || '';

        // a sale is either taken on the card reader or in cash
        const paidAs = source => (source === 'cash' ? 'Cash' : 'Card');

        // a market's takings belong to the market, not here
        const singles = sales
          .filter(sale => !sale.eventId && (sale.occurredAt || '').slice(0, 7) === selected)
          .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime())
          .map(sale => {
            const when = new Date(sale.occurredAt || Date.now());
            const items = (sale.lineItems || []).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
            const cost = (sale.lineItems || []).reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0);
            const total = Number(sale.total) || 0;
            const isOpen = openId === sale.id;
            return {
              id: sale.id,
              amount: total,
              dayStr: isNaN(when.getTime()) ? '' : when.toLocaleString('en-US', { month: 'short', day: 'numeric' }),
              timeStr: isNaN(when.getTime()) ? '' : when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              itemsStr: items + (items === 1 ? ' item' : ' items'),
              totalStr: CUR + total.toFixed(2),
              keptStr: CUR + (total - cost).toFixed(2),
              costStr: CUR + cost.toFixed(2),
              paidStr: paidAs(sale.source),
              caret: isOpen ? '▴' : '▾',
              isOpen,
              lines: (sale.lineItems || []).map(line => ({
                name: line.name || 'Item',
                qtyStr: '×' + (Number(line.quantity) || 0),
                eachStr: CUR + (Number(line.unitPrice) || 0).toFixed(2) + ' each',
                lineStr: CUR + ((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toFixed(2)
              })),
              toggle: () => this.setState(st => ({ openSaleId: st.openSaleId === sale.id ? '' : sale.id }))
            };
          });

        // The Items Sold square on the overview covers the whole month,
        // counter and market alike. Saying how it splits stops the total
        // looking like it disagrees with what the month breakdown lists.
        const monthSales = sales.filter(sale => (sale.occurredAt || '').slice(0, 7) === selected);
        const marketsWithSales = new Set(monthSales.filter(sale => sale.eventId).map(sale => sale.eventId));
        const orderWord = count => count + (count === 1 ? ' order' : ' orders');
        const eventWord = count => count + (count === 1 ? ' event' : ' events');

        return {
          monthOrdersSplit: marketsWithSales.size
            ? orderWord(singles.length) + ' · ' + eventWord(marketsWithSales.size)
            : orderWord(singles.length),
          singleSales: singles,
          hasSingleSales: singles.length > 0
        };
      })(),
`;

function addSingleSalesController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable single-sales anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${singleSalesController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

const listMarkup = `
  <sc-if value="{{ hasSingleSales }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">Single sales</div>
    <div class="an-card">
      <sc-for list="{{ singleSales }}" as="ss" hint-placeholder-count="3">
        <div>
          <div class="an-row" sc-camel-on-click="{{ ss.toggle }}" style="cursor:pointer">
            <div class="an-row-main">
              <div class="an-row-name">{{ ss.dayStr }} · {{ ss.itemsStr }}</div>
              <div class="an-row-sub">{{ ss.timeStr }} · {{ ss.paidStr }}</div>
            </div>
            <div class="an-row-val">{{ ss.totalStr }}</div>
            <span class="text-muted" style="flex:none;font-size:12px;width:14px;text-align:right">{{ ss.caret }}</span>
          </div>
          <sc-if value="{{ ss.isOpen }}" hint-placeholder-val="{{ false }}">
            <div style="padding:0 2px 14px">
              <sc-for list="{{ ss.lines }}" as="sl" hint-placeholder-count="2">
                <div style="display:flex;align-items:baseline;gap:10px;padding:5px 0;font-size:13px">
                  <span style="flex:1;min-width:0">{{ sl.name }} <span class="text-muted">{{ sl.qtyStr }}</span></span>
                  <span class="text-muted" style="font-size:11px;flex:none">{{ sl.eachStr }}</span>
                  <span style="font-feature-settings:'tnum';flex:none">{{ sl.lineStr }}</span>
                </div>
              </sc-for>
              <div style="display:flex;justify-content:space-between;font-size:12px;padding-top:8px;margin-top:4px;border-top:1px solid var(--color-divider)">
                <span class="text-muted">Ingredients and packaging</span>
                <span class="text-muted" style="font-feature-settings:'tnum'">−{{ ss.costStr }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;padding-top:6px">
                <span style="font-weight:600">You kept</span>
                <span style="font-weight:600;font-feature-settings:'tnum'">{{ ss.keptStr }}</span>
              </div>
            </div>
          </sc-if>
        </div>
      </sc-for>
    </div>
  </sc-if>
`;

/**
 * The month breakdown, where the rest of that month is already reported. The
 * overview summarises every month; one month's individual sales belong on that
 * month's own page, not under a chart of all of them.
 */
function addSingleSalesList(template: string): string {
  const anchor = "<!--single-sales-here-->";
  if (!template.includes(anchor)) throw new Error("Missing single sales anchor");
  return template.replace(anchor, () => listMarkup);
}

/** The Items Sold square says how the month splits, rather than one total. */
function bindOrdersSplit(template: string): string {
  const anchor = '<div class="an-stat-sub">in {{ monthSalesCount }} orders ›</div>';
  if (!template.includes(anchor)) throw new Error("Missing orders subtitle anchor");
  return template.replace(anchor, () => '<div class="an-stat-sub">{{ monthOrdersSplit }} ›</div>');
}

/**
 * Products first, then groups. What sold is the question being asked; the
 * grouping is context for it.
 */
function productsBeforeGroups(template: string): string {
  const groupBlock = `    <div class="an-section-title">By group</div>
    <div class="an-card">
      <sc-for list="{{ groupRows }}" as="grp" hint-placeholder-count="4">
        <div class="an-row">
          <div class="an-row-main">
            <div class="an-row-name">{{ grp.label }}</div>
            <div class="an-row-sub">{{ grp.sub }} · {{ grp.revStr }} revenue</div>
            <div class="an-mini-bar"><span style="width:{{ grp.barWidth }}"></span></div>
          </div>
          <div class="an-row-val">{{ grp.unitsStr }}<div class="an-row-sub" style="margin-top:3px">{{ grp.shareStr }}</div></div>
        </div>
      </sc-for>
    </div>`;
  const productBlock = `    <div class="an-section-title">By product</div>
    <div class="an-card">
      <sc-for list="{{ itemProductRows }}" as="row" hint-placeholder-count="5">
        <div class="an-row">
          <div class="an-row-main">
            <div class="an-row-name">{{ row.name }}</div>
            <div class="an-row-sub">{{ row.revStr }} revenue · {{ row.shareStr }} of items</div>
            <div class="an-mini-bar"><span style="width:{{ row.barWidth }}"></span></div>
          </div>
          <div class="an-row-val">{{ row.unitsStr }}</div>
        </div>
      </sc-for>
    </div>`;
  const together = groupBlock + "\n\n" + productBlock;
  if (!template.includes(together)) throw new Error("Missing items drill-down anchor");
  return template.replace(together, () => productBlock + "\n\n" + groupBlock);
}

export function applySingleSalesBehavior(template: string): string {
  return productsBeforeGroups(
    bindOrdersSplit(addSingleSalesList(addSingleSalesController(template))),
  );
}
