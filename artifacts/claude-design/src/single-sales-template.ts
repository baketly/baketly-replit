// Counter sales, listed where the rest of the month is reported.
//
// Analytics could tell you what a market took, because a market is a thing
// with a page of its own. A sale rung up over the counter vanished into the
// month's totals — countable, but never listed, so there was no way to see
// what any single one of them actually was.
//
// The overview now lists them, newest first, one line each. Tapping a line
// opens what was in it.

const singleSalesController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const sales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords : [];
        const now = new Date();
        const monthKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        const selected = this.state.analyticsMonth || monthKey(now);
        const openId = this.state.openSaleId || '';

        const paidAs = source => (source === 'cash' ? 'Cash' : 'Counter');

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

        const takings = singles.reduce((sum, sale) => sum + sale.amount, 0);

        return {
          singleSales: singles,
          hasSingleSales: singles.length > 0,
          hasNoSingleSales: singles.length === 0,
          singleSalesCountStr: singles.length === 1
            ? '1 sale · ' + CUR + takings.toFixed(2)
            : singles.length + ' sales · ' + CUR + takings.toFixed(2)
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
    <h6 style="margin-top:28px;margin-bottom:2px;font-size:16px;font-weight:600">Single sales</h6>
    <div class="text-muted" style="font-size:12px;margin-bottom:6px">{{ singleSalesCountStr }}</div>
    <sc-if value="{{ hasNoSingleSales }}" hint-placeholder-val="{{ false }}">
      <div class="text-muted" style="font-size:13px;padding:14px 0;border-top:1px solid var(--color-divider)">No counter sales this month. Sales rung up at a market are shown with that market.</div>
    </sc-if>
    <div style="display:flex;flex-direction:column">
      <sc-for list="{{ singleSales }}" as="ss" hint-placeholder-count="3">
        <div style="border-top:1px solid var(--color-divider)">
          <div class="bk-row" sc-camel-on-click="{{ ss.toggle }}" style="display:flex;align-items:center;gap:12px;padding:13px 2px;cursor:pointer;min-height:44px">
            <div style="flex:1;min-width:0">
              <div style="font-size:14px">{{ ss.dayStr }} · {{ ss.itemsStr }}</div>
              <div class="text-muted" style="font-size:11px">{{ ss.timeStr }} · {{ ss.paidStr }}</div>
            </div>
            <div style="text-align:right;flex:none;font-feature-settings:'tnum';font-size:14px">{{ ss.totalStr }}</div>
            <span class="text-muted" style="flex:none;font-size:12px;width:12px;text-align:right">{{ ss.caret }}</span>
          </div>
          <sc-if value="{{ ss.isOpen }}" hint-placeholder-val="{{ false }}">
            <div style="padding:2px 2px 14px">
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
`;

/** Sits under Revenue Trends, at the end of the overview tab. */
function addSingleSalesList(template: string): string {
  const anchor = `    <div class="an-bar-container">
      <sc-for list="{{ chartBars }}" as="bar" hint-placeholder-count="6">
        <div class="an-bar-col" sc-camel-on-click="{{ bar.open }}" style="cursor:pointer">
          <div class="an-bar {{ bar.activeCls }}" style="height:{{ bar.height }}"></div>
          <div class="an-bar-label">{{ bar.label }}</div>
        </div>
      </sc-for>
    </div>`;
  if (!template.includes(anchor)) throw new Error("Missing revenue trends anchor");
  return template.replace(anchor, () => anchor + "\n" + listMarkup);
}

export function applySingleSalesBehavior(template: string): string {
  return addSingleSalesList(addSingleSalesController(template));
}
