// What to bake for the next market.
//
// The Events tab answered one question — was that market worth the table —
// and it answered it a market at a time. The decision a baker actually has to
// make is the next one: what to load the van with. That needs the products
// looked at across every market rather than inside one, and it needs two
// things the ROI cards never showed: how much of what was baked actually sold,
// and what each product keeps once its ingredients are paid for.
//
// Every market stores what was planned for it, and every sale stores what went
// out and what it cost to make, so both are already in the data.

const eventInsightsController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const money = value => CUR + value.toFixed(2);
        const sales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords : [];
        const allEvents = Array.isArray(this.state.eventRecords) ? this.state.eventRecords : [];
        const nowMs = Date.now();

        // A market still being planned has everything baked and nothing sold,
        // which would read as a total failure. Only markets that have happened
        // can say anything about what sells.
        const soldAt = {};
        sales.forEach(sale => { if (sale.eventId) soldAt[sale.eventId] = true; });
        const held = allEvents.filter(ev => {
          if (soldAt[ev.id]) return true;
          if (ev.status === 'planned') return false;
          const when = new Date(ev.occurredAt || 0).getTime();
          return !isNaN(when) && when <= nowMs;
        });
        const heldIds = {};
        held.forEach(ev => { heldIds[ev.id] = true; });

        // ---- baked, sold, kept, per product -----------------------------
        const board = {};
        const reach = (key, name) => {
          if (!board[key]) board[key] = { key, name: name || 'Item', baked: 0, sold: 0, revenue: 0, cost: 0, markets: 0, soldOutAt: 0 };
          if (name && board[key].name === 'Item') board[key].name = name;
          return board[key];
        };
        held.forEach(ev => {
          const bakedHere = {};
          (ev.plannedItems || []).forEach(item => {
            const key = (item && item.productId) || (item && item.name);
            if (!key) return;
            const row = reach(key, item.name);
            const quantity = Math.max(0, Number(item.quantity) || 0);
            row.baked += quantity;
            row.markets += 1;
            bakedHere[key] = quantity;
          });
          const soldHere = {};
          sales.filter(sale => sale.eventId === ev.id).forEach(sale => {
            (sale.lineItems || []).forEach(line => {
              const key = line.productId || line.name;
              if (!key) return;
              const row = reach(key, line.name);
              const quantity = Number(line.quantity) || 0;
              row.sold += quantity;
              row.revenue += quantity * (Number(line.unitPrice) || 0);
              row.cost += quantity * (Number(line.unitCost) || 0);
              soldHere[key] = (soldHere[key] || 0) + quantity;
            });
          });
          // sold out means the table ran empty, which is the signal to bake more
          Object.keys(bakedHere).forEach(key => {
            if (bakedHere[key] > 0 && (soldHere[key] || 0) >= bakedHere[key]) board[key].soldOutAt += 1;
          });
        });

        const rows = Object.keys(board).map(key => {
          const row = board[key];
          const rate = row.baked > 0 ? Math.min(100, Math.round((row.sold / row.baked) * 100)) : null;
          const kept = row.revenue - row.cost;
          const margin = row.revenue > 0 ? Math.round((kept / row.revenue) * 100) : 0;
          const perUnit = row.sold > 0 ? kept / row.sold : 0;
          const leftover = Math.max(0, row.baked - row.sold);
          return {
            ...row, rate, kept, margin, perUnit, leftover,
            // what the unsold ones cost to make, which is the price of baking
            // optimistically rather than a number the ledger ever shows
            wasted: row.sold > 0 ? leftover * (row.cost / row.sold) : 0
          };
        }).filter(row => row.sold > 0);

        const sortBy = this.state.eventProductSort === 'margin' ? 'margin' : 'rate';
        const ordered = [...rows].sort((a, b) => sortBy === 'margin'
          ? b.margin - a.margin || b.perUnit - a.perUnit
          : (a.rate === null ? 101 : a.rate) - (b.rate === null ? 101 : b.rate) || b.baked - a.baked);

        const bakedTotal = rows.reduce((sum, row) => sum + row.baked, 0);
        const soldTotal = rows.reduce((sum, row) => sum + row.sold, 0);
        const wastedTotal = rows.reduce((sum, row) => sum + row.wasted, 0);
        const leftTotal = Math.max(0, bakedTotal - soldTotal);

        const productRows = ordered.map(row => ({
          name: row.name,
          madeStr: row.baked > 0
            ? row.baked + ' baked · ' + row.sold + ' sold'
            : row.sold + ' sold',
          rateStr: row.rate === null ? '—' : row.rate + '%',
          barWidth: (row.rate === null ? 0 : row.rate) + '%',
          // red only where it is telling you something is wrong
          barColor: row.rate !== null && row.rate < 70 ? '#b0563e' : 'var(--color-accent)',
          marginStr: row.margin + '%',
          perUnitStr: money(row.perUnit) + ' each',
          open: () => this.setState(st => ({
            analyticsProductId: row.key,
            screen: 'analyticsProduct',
            stack: [...st.stack, st.screen]
          }))
        }));

        // ---- what to do about it ----------------------------------------
        const advice = [];
        const soldOut = rows.filter(row => row.soldOutAt > 0)
          .sort((a, b) => b.soldOutAt - a.soldOutAt || b.baked - a.baked);
        const nearlyRight = rows.filter(row =>
          row.soldOutAt === 0 && row.baked > 0 && row.rate !== null && row.rate >= 90)
          .sort((a, b) => b.rate - a.rate);
        const slow = rows.filter(row => row.baked > 0 && row.rate !== null && row.rate < 70)
          .sort((a, b) => a.rate - b.rate);
        const earners = rows.filter(row => row.sold > 0).sort((a, b) => b.perUnit - a.perUnit);

        soldOut.slice(0, 2).forEach(row => advice.push({
          tone: 'var(--color-accent)',
          text: row.name + ' ran out at ' + row.soldOutAt + (row.soldOutAt === 1 ? ' market' : ' markets')
            + '. Bake more of it and you would have sold more.'
        }));
        nearlyRight.slice(0, 1).forEach(row => advice.push({
          tone: 'var(--color-accent)',
          text: row.name + ' sold ' + row.rate + '% of what you baked without ever running out. '
            + 'That is about the right number to bake.'
        }));
        slow.slice(0, 2).forEach(row => advice.push({
          tone: '#b0563e',
          text: row.name + ' sold ' + row.rate + '% of what you baked. '
            + row.leftover + ' came home, about ' + money(row.wasted) + ' of ingredients.'
        }));
        if (earners.length) advice.push({
          tone: 'var(--color-accent)',
          text: earners[0].name + ' keeps the most of any product at ' + money(earners[0].perUnit)
            + ' a unit. Give it the room on the table.'
        });
        if (earners.length > 2) {
          const worst = earners[earners.length - 1];
          advice.push({
            tone: 'var(--color-neutral-500)',
            text: worst.name + ' keeps the least at ' + money(worst.perUnit)
              + ' a unit. Worth a higher price, or less of the table.'
          });
        }

        return {
          eventProducts: productRows,
          hasEventProducts: productRows.length > 0,
          hasNoEventProducts: productRows.length === 0,
          eventMarketCount: held.length + (held.length === 1 ? ' market' : ' markets'),
          eventSellThroughStr: bakedTotal > 0 ? Math.round((soldTotal / bakedTotal) * 100) + '%' : '—',
          eventLeftoverStr: String(leftTotal),
          eventWasteStr: money(wastedTotal),
          eventAdvice: advice,
          hasEventAdvice: advice.length > 0,
          sortExplainer: sortBy === 'margin'
            ? 'Ordered by margin — the share of the price you keep after ingredients and packaging. Best first.'
            : 'Ordered by how much of each bake sold at the table. Worst first, so what is coming home is at the top.',
          sortByRate: sortBy === 'rate',
          sortByMargin: sortBy === 'margin',
          rateChipBg: sortBy === 'rate' ? 'var(--color-accent)' : '#fff',
          rateChipColor: sortBy === 'rate' ? '#fff' : 'var(--color-text)',
          marginChipBg: sortBy === 'margin' ? 'var(--color-accent)' : '#fff',
          marginChipColor: sortBy === 'margin' ? '#fff' : 'var(--color-text)',
          sortByRateNow: () => this.setState({ eventProductSort: 'rate' }),
          sortByMarginNow: () => this.setState({ eventProductSort: 'margin' })
        };
      })(),
`;

function addEventInsightsController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable event insights anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${eventInsightsController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

const insightsMarkup = `
    <sc-if value="{{ hasEventProducts }}" hint-placeholder-val="{{ true }}">
      <div class="an-section-title" style="margin-top:8px">Across every market</div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--color-divider);border-radius:var(--radius-md);background:#fff;margin-bottom:6px">
        <div style="padding:12px 10px"><div class="an-stat-label">Sold of baked</div><div style="font-family:var(--font-heading);font-weight:600;font-size:20px;font-feature-settings:'tnum'">{{ eventSellThroughStr }}</div></div>
        <div style="padding:12px 10px;border-left:1px solid var(--color-divider)"><div class="an-stat-label">Came home</div><div style="font-family:var(--font-heading);font-weight:600;font-size:20px;font-feature-settings:'tnum'">{{ eventLeftoverStr }}</div></div>
        <div style="padding:12px 10px;border-left:1px solid var(--color-divider)"><div class="an-stat-label">They cost</div><div style="font-family:var(--font-heading);font-weight:600;font-size:20px;font-feature-settings:'tnum'">{{ eventWasteStr }}</div></div>
      </div>
      <div class="text-muted" style="font-size:12px;margin-bottom:18px">Everything you have taken to a market, over {{ eventMarketCount }}. What came home is what you baked and did not sell, and what its ingredients cost you.</div>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="text-muted" style="font-size:12px;flex:none">Show</span>
        <button sc-camel-on-click="{{ sortByRateNow }}" style="flex:none;height:32px;padding:0 12px;font-family:var(--font-body);font-size:12px;font-weight:600;border-radius:999px;cursor:pointer;border:1px solid var(--color-neutral-300);background:{{ rateChipBg }};color:{{ rateChipColor }}">Slowest sellers</button>
        <button sc-camel-on-click="{{ sortByMarginNow }}" style="flex:none;height:32px;padding:0 12px;font-family:var(--font-body);font-size:12px;font-weight:600;border-radius:999px;cursor:pointer;border:1px solid var(--color-neutral-300);background:{{ marginChipBg }};color:{{ marginChipColor }}">Best margin</button>
      </div>

      <div class="text-muted" style="font-size:12px;margin-bottom:10px">{{ sortExplainer }}</div>
      <div class="an-card" style="padding:0 16px">
        <sc-for list="{{ eventProducts }}" as="ep" hint-placeholder-count="4">
          <div class="an-list-item bk-row" sc-camel-on-click="{{ ep.open }}" style="cursor:pointer;min-height:44px;gap:12px;align-items:flex-start">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:500;margin-bottom:2px">{{ ep.name }}</div>
              <div class="text-muted" style="font-size:12px;margin-bottom:6px">{{ ep.madeStr }}</div>
              <div style="height:4px;border-radius:2px;background:var(--color-neutral-200);overflow:hidden"><div style="height:4px;border-radius:2px;width:{{ ep.barWidth }};background:{{ ep.barColor }}"></div></div>
            </div>
            <div style="flex:none;text-align:right">
              <div style="font-size:15px;font-weight:600;font-feature-settings:'tnum'">{{ ep.rateStr }}</div>
              <div class="text-muted" style="font-size:11px;font-feature-settings:'tnum'">{{ ep.marginStr }} margin</div>
              <div class="text-muted" style="font-size:11px;font-feature-settings:'tnum'">keeps {{ ep.perUnitStr }}</div>
            </div>
          </div>
        </sc-for>
      </div>

      <sc-if value="{{ hasEventAdvice }}" hint-placeholder-val="{{ true }}">
        <div class="an-section-title">For your next market</div>
        <div class="an-card">
          <sc-for list="{{ eventAdvice }}" as="tip" hint-placeholder-count="3">
            <div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0">
              <span style="flex:none;width:6px;height:6px;border-radius:50%;margin-top:6px;background:{{ tip.tone }}"></span>
              <span style="font-size:13px;line-height:1.5">{{ tip.text }}</span>
            </div>
          </sc-for>
        </div>
      </sc-if>

      <div class="an-section-title">Market by market</div>
    </sc-if>
`;

/** Above the ROI cards, which stay as they are. */
function addEventInsights(template: string): string {
  const anchor =
    '    <p class="text-muted" style="font-size:13px;margin-bottom:20px">Profit after booth fees and production costs.</p>';
  if (!template.includes(anchor)) throw new Error("Missing events subtitle anchor");
  const heading =
    '    <p class="text-muted" style="font-size:13px;margin-bottom:20px">What sells, what earns, and what to bake next time.</p>';
  return template.replace(anchor, () => heading + insightsMarkup);
}

/** The tab is no longer only about return on investment. */
function renameEventsHeading(template: string): string {
  const anchor = '<h2 style="font-size:24px;margin:8px 0 4px">Event ROI</h2>';
  if (!template.includes(anchor)) throw new Error("Missing events heading anchor");
  return template.replace(anchor, () => '<h2 style="font-size:24px;margin:8px 0 4px">Markets</h2>');
}

export function applyEventInsightsBehavior(template: string): string {
  return renameEventsHeading(addEventInsights(addEventInsightsController(template)));
}
