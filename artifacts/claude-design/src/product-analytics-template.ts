// A page for one product.
//
// The Products tab tried to say everything about every product at once: four
// lines a row, revenue, profit, margin, production cost and a sentence of
// pricing advice. Nine products made a wall of numbers that was hard to read
// and impossible to compare.
//
// The tab is now a list — what each product sold, its share of the month, what
// it earned — and every product opens a page of its own, where there is room
// for how it has sold month by month, what it has been charged at over time,
// and what it has come to in total.

const productAnalyticsController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const sales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords : [];
        const recipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const now = new Date();
        const keyOf = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        const selected = this.state.analyticsMonth || keyOf(now);
        const money = value => CUR + value.toFixed(2);

        // ---- every product, by month ------------------------------------
        const byProduct = {};
        const reach = id => {
          if (!byProduct[id]) byProduct[id] = { id, name: '', months: {} };
          return byProduct[id];
        };
        sales.forEach(sale => {
          const month = String(sale.occurredAt || '').slice(0, 7);
          (sale.lineItems || []).forEach(line => {
            const entry = reach(line.productId);
            if (!entry.name) entry.name = line.name || 'Unknown product';
            if (!entry.months[month]) entry.months[month] = { items: 0, revenue: 0, cost: 0 };
            const bucket = entry.months[month];
            const qty = Number(line.quantity) || 0;
            bucket.items += qty;
            bucket.revenue += qty * (Number(line.unitPrice) || 0);
            bucket.cost += qty * (Number(line.unitCost) || 0);
          });
        });

        // A recipe that has not sold is still a product you have. It belongs in
        // the list, at nothing, rather than disappearing from it.
        recipes.forEach(recipe => {
          const entry = reach(recipe.id);
          entry.name = recipe.name || entry.name || 'Untitled recipe';
          entry.recipe = recipe;
        });

        const unitCostOf = recipe => {
          if (!recipe) return 0;
          const perUnit = (recipe.ingredientKeys || []).reduce((sum, key) =>
            sum + (Number((recipe.amounts || {})[key]) || 0) * (this.ING_META[key] ? this.ING_META[key].per : 0), 0)
            / Math.max(1, Number(recipe.yield) || 1);
          const packaging = (recipe.packagingKeys || []).reduce((sum, key) =>
            sum + (this.PACK_META[key] ? this.PACK_META[key].per : 0), 0);
          return perUnit + packaging;
        };

        const totalsOf = entry => Object.keys(entry.months).reduce((sum, month) => {
          const bucket = entry.months[month];
          sum.items += bucket.items;
          sum.revenue += bucket.revenue;
          sum.cost += bucket.cost;
          return sum;
        }, { items: 0, revenue: 0, cost: 0 });

        const products = Object.keys(byProduct).map(id => byProduct[id]);
        const monthRevenue = products.reduce((sum, entry) =>
          sum + ((entry.months[selected] || {}).revenue || 0), 0);

        // ---- the list ----------------------------------------------------
        const listRows = products.map(entry => {
          const month = entry.months[selected] || { items: 0, revenue: 0, cost: 0 };
          const share = monthRevenue > 0 ? Math.round((month.revenue / monthRevenue) * 100) : 0;
          return {
            id: entry.id,
            name: entry.name || 'Untitled recipe',
            revenue: month.revenue,
            soldStr: month.items + (month.items === 1 ? ' sold' : ' sold'),
            shareStr: share + '% of sales',
            revStr: money(month.revenue),
            dotColor: 'var(--color-neutral-300)',
            rowBg: 'transparent',
            open: () => this.setState(st => ({
              analyticsProductId: entry.id,
              screen: 'analyticsProduct',
              stack: [...st.stack, st.screen]
            }))
          };
        }).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

        // ---- the month as a whole ----------------------------------------
        // One <svg> per slice, laid over each other, so the loop stays in HTML
        // where it works and each wedge is its own click target. The svg boxes
        // let pointer events through; only the painted path takes them, so a
        // click lands on the slice under the finger rather than the last one
        // drawn.
        const palette = ['#7c8c3f', '#a8996a', '#9aa85e', '#c4b78e', '#b8c383',
                         '#8a7f4a', '#6b7a35', '#d3dbae', '#5a6a2c', '#c9cfa4'];
        // 44 + the 5 a chosen slice lifts by stays inside the 50 the box allows
        const RADIUS = 44;
        const LIFT = 5;
        const onCircle = angle =>
          (50 + RADIUS * Math.cos(angle)).toFixed(2) + ' ' + (50 + RADIUS * Math.sin(angle)).toFixed(2);
        // Ten slices on a phone leave no room for labels around the ring, so
        // the chart names the one you touch instead: it lifts out of the circle,
        // the rest fade back, and the line under the chart says which product it
        // is and what it earned. Its row in the list lights up with it.
        const earning = listRows.filter(row => row.revenue > 0);
        const picked = earning.some(row => row.id === (this.state.pieSelectedId || ''))
          ? this.state.pieSelectedId
          : '';
        let sweep = -Math.PI / 2;
        const pieSlices = earning.map((row, index) => {
          const fraction = row.revenue / monthRevenue;
          const from = sweep;
          const to = sweep + fraction * Math.PI * 2;
          sweep = to;
          row.dotColor = palette[index % palette.length];
          const chosen = row.id === picked;
          if (chosen) row.rowBg = 'var(--color-accent-100)';
          const middle = (from + to) / 2;
          const lift = chosen ? LIFT : 0;
          return {
            name: row.name,
            color: row.dotColor,
            // one product taking the whole month has no arc to draw, so the
            // circle is closed with two half turns instead
            d: fraction >= 0.9999
              ? 'M 50 ' + (50 - RADIUS) + ' A ' + RADIUS + ' ' + RADIUS + ' 0 1 1 50 ' + (50 + RADIUS)
                + ' A ' + RADIUS + ' ' + RADIUS + ' 0 1 1 50 ' + (50 - RADIUS) + ' Z'
              : 'M 50 50 L ' + onCircle(from) + ' A ' + RADIUS + ' ' + RADIUS + ' 0 '
                + (fraction > 0.5 ? 1 : 0) + ' 1 ' + onCircle(to) + ' Z',
            shift: 'translate(' + (lift * Math.cos(middle)).toFixed(2) + ' ' + (lift * Math.sin(middle)).toFixed(2) + ')',
            fade: !picked || chosen ? '1' : '0.45',
            // above the others, so nothing paints over the edge it just lifted
            layer: chosen ? '2' : '1',
            // touching a slice only ever names it. A wedge a few degrees wide
            // is easy to catch by accident, and a tap that navigates on the
            // second try makes that accident expensive; the button on the line
            // underneath is the way in.
            open: () => this.setState({ pieSelectedId: row.id })
          };
        });
        const pickedRow = earning.find(row => row.id === picked) || null;

        // ---- the page for one of them ------------------------------------
        const chosen = byProduct[this.state.analyticsProductId || ''] || null;
        const window6 = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          window6.push(keyOf(d));
        }
        const shortMonth = key => {
          const d = new Date(Number(key.split('-')[0]), Number(key.split('-')[1]) - 1, 1);
          return isNaN(d.getTime()) ? key : d.toLocaleString('en-US', { month: 'short' });
        };
        const longMonth = key => {
          const d = new Date(Number(key.split('-')[0]), Number(key.split('-')[1]) - 1, 1);
          return isNaN(d.getTime()) ? key : d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        };

        let detail = null;
        if (chosen) {
          const totals = totalsOf(chosen);
          const month = chosen.months[selected] || { items: 0, revenue: 0, cost: 0 };
          const share = monthRevenue > 0 ? Math.round((month.revenue / monthRevenue) * 100) : 0;
          const cost = unitCostOf(chosen.recipe);
          const saved = chosen.recipe ? Number(chosen.recipe.price) || 0 : 0;

          const mostSold = window6.reduce((most, key) =>
            Math.max(most, (chosen.months[key] || {}).items || 0), 0);
          const soldBars = window6.map(key => {
            const bucket = chosen.months[key] || { items: 0, revenue: 0 };
            return {
              label: shortMonth(key),
              countStr: bucket.items ? String(bucket.items) : '',
              height: mostSold > 0 ? Math.max(4, Math.round((bucket.items / mostSold) * 100)) + '%' : '4px',
              activeCls: key === selected ? 'active' : ''
            };
          });

          // what it actually went out at, month by month: the line items carry
          // the price charged at the time, which is not always the saved one
          const priced = window6
            .map(key => ({ key, bucket: chosen.months[key] }))
            .filter(entry => entry.bucket && entry.bucket.items > 0)
            .map(entry => ({ key: entry.key, price: entry.bucket.revenue / entry.bucket.items }));
          const prices = priced.map(point => point.price);
          const low = prices.length ? Math.min(...prices) : 0;
          const high = prices.length ? Math.max(...prices) : 0;
          // a flat line sits in the middle of the box rather than on its floor
          const span = high - low;
          const plot = (price, index) => {
            const x = priced.length === 1 ? 150 : 10 + (index / (priced.length - 1)) * 280;
            const y = span > 0 ? 78 - ((price - low) / span) * 66 : 45;
            return Math.round(x) + ',' + Math.round(y);
          };

          const lifetimeMargin = totals.revenue > 0
            ? Math.round(((totals.revenue - totals.cost) / totals.revenue) * 100) : 0;
          const best = Object.keys(chosen.months)
            .filter(key => (chosen.months[key] || {}).items > 0)
            .sort((a, b) => chosen.months[b].items - chosen.months[a].items)[0];

          detail = {
            name: chosen.name || 'Untitled recipe',
            monthLabel: longMonth(selected),
            soldStr: String(month.items),
            revStr: money(month.revenue),
            shareStr: share + '%',
            marginStr: month.revenue > 0
              ? Math.round(((month.revenue - month.cost) / month.revenue) * 100) + '%'
              : '—',
            soldBars,
            hasPriceLine: priced.length > 1 && span > 0.005,
            hasFlatPrice: priced.length > 1 && span <= 0.005,
            hasOnePrice: priced.length === 1,
            hasNoPrice: priced.length === 0,
            priceLinePoints: priced.map((point, index) => plot(point.price, index)).join(' '),
            priceLabels: priced.map(point => ({ label: shortMonth(point.key) })),
            priceLowStr: money(low),
            priceHighStr: money(high),
            priceOneStr: money(high),
            priceRangeStr: span > 0.005 ? money(low) + ' – ' + money(high) : money(high),
            savedPriceStr: saved > 0 ? money(saved) : 'no saved price',
            unitCostStr: cost > 0 ? money(cost) : '—',
            lifetimeItemsStr: String(totals.items),
            lifetimeRevStr: money(totals.revenue),
            lifetimeCostStr: money(totals.cost),
            lifetimeKeptStr: money(totals.revenue - totals.cost),
            lifetimeMarginStr: lifetimeMargin + '%',
            bestMonthStr: best ? longMonth(best) + ' · ' + chosen.months[best].items + ' sold' : 'nothing sold yet',
            neverSold: totals.items === 0
          };
        }

        const blank = {
          name: '', monthLabel: '', soldStr: '0', revStr: money(0), shareStr: '0%', marginStr: '—',
          soldBars: [], hasPriceLine: false, hasFlatPrice: false, hasOnePrice: false, hasNoPrice: true,
          priceLinePoints: '', priceLabels: [], priceLowStr: '', priceHighStr: '', priceOneStr: '',
          priceRangeStr: '', savedPriceStr: '', unitCostStr: '—', lifetimeItemsStr: '0',
          lifetimeRevStr: money(0), lifetimeCostStr: money(0), lifetimeKeptStr: money(0),
          lifetimeMarginStr: '0%', bestMonthStr: '', neverSold: true
        };
        const shown = detail || blank;

        return {
          productPie: pieSlices,
          hasProductPie: pieSlices.length > 0,
          hasNoProductPie: pieSlices.length === 0,
          pieTotalStr: money(monthRevenue),
          pieHasPick: !!pickedRow,
          pieNoPick: !pickedRow,
          pickedName: pickedRow ? pickedRow.name : '',
          pickedColor: pickedRow ? pickedRow.dotColor : 'transparent',
          clearPick: () => this.setState({ pieSelectedId: '' }),
          openPickedProduct: () => this.setState(st => (pickedRow
            ? { analyticsProductId: pickedRow.id, screen: 'analyticsProduct', stack: [...st.stack, st.screen] }
            : {})),
          analyticsProducts: listRows,
          hasAnyProducts: listRows.length > 0,
          hasNoAnyProducts: listRows.length === 0,
          onAnalyticsProduct: screen === 'analyticsProduct',
          productName: shown.name,
          productMonthLabel: shown.monthLabel,
          productSoldStr: shown.soldStr,
          productRevStr: shown.revStr,
          productShareStr: shown.shareStr,
          productMarginStr: shown.marginStr,
          productSoldBars: shown.soldBars,
          productHasPriceLine: shown.hasPriceLine,
          productHasFlatPrice: shown.hasFlatPrice,
          productHasOnePrice: shown.hasOnePrice,
          productHasNoPrice: shown.hasNoPrice,
          productPriceLine: shown.priceLinePoints,
          productPriceLabels: shown.priceLabels,
          productPriceRangeStr: shown.priceRangeStr,
          productPriceOneStr: shown.priceOneStr,
          productSavedPriceStr: shown.savedPriceStr,
          productUnitCostStr: shown.unitCostStr,
          productLifetimeItemsStr: shown.lifetimeItemsStr,
          productLifetimeRevStr: shown.lifetimeRevStr,
          productLifetimeCostStr: shown.lifetimeCostStr,
          productLifetimeKeptStr: shown.lifetimeKeptStr,
          productLifetimeMarginStr: shown.lifetimeMarginStr,
          productBestMonthStr: shown.bestMonthStr,
          productNeverSold: shown.neverSold
        };
      })(),
`;

function addProductAnalyticsController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable product analytics anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${productAnalyticsController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** Three lines a row: what it sold, its share of the month, what it earned. */
const listMarkup = `
    <sc-if value="{{ hasProductPie }}" hint-placeholder-val="{{ true }}">
      <div class="an-card" style="display:flex;flex-direction:column;align-items:center;padding:20px 16px">
        <div style="position:relative;width:190px;height:190px">
          <sc-for list="{{ productPie }}" as="slice" hint-placeholder-count="4">
            <svg width="190" height="190" sc-camel-view-box="0 0 100 100" style="position:absolute;top:0;left:0;pointer-events:none;z-index:{{ slice.layer }}">
              <path d="{{ slice.d }}" fill="{{ slice.color }}" stroke="#fff" stroke-width="0.7" transform="{{ slice.shift }}" opacity="{{ slice.fade }}" sc-camel-on-click="{{ slice.open }}" style="pointer-events:auto;cursor:pointer"></path>
            </svg>
          </sc-for>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3;width:96px;height:96px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
            <div style="font-family:var(--font-heading);font-weight:600;font-size:18px;font-feature-settings:'tnum'">{{ pieTotalStr }}</div>
            <div class="text-muted" style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase">this month</div>
          </div>
        </div>
        <sc-if value="{{ pieNoPick }}" hint-placeholder-val="{{ true }}">
          <div class="text-muted" style="font-size:12px;margin-top:14px;text-align:center">Tap a slice to see which product it is.</div>
        </sc-if>
        <sc-if value="{{ pieHasPick }}" hint-placeholder-val="{{ false }}">
          <div style="display:flex;align-items:center;gap:10px;width:100%;margin-top:14px;padding-top:14px;border-top:1px solid var(--color-divider)">
            <span style="flex:none;width:12px;height:12px;border-radius:50%;background:{{ pickedColor }}"></span>
            <div style="flex:1;min-width:0;font-size:14px;font-weight:500">{{ pickedName }}</div>
            <button class="btn btn-secondary" sc-camel-on-click="{{ openPickedProduct }}" style="flex:none;min-height:38px;font-size:12px;padding:0 12px">Details ›</button>
            <button class="btn btn-icon btn-secondary" sc-camel-on-click="{{ clearPick }}" aria-label="Show every product again" style="flex:none;width:32px;height:32px;min-height:0;color:#8a8578;font-size:16px;line-height:1">×</button>
          </div>
        </sc-if>
      </div>
    </sc-if>
    <sc-if value="{{ hasAnyProducts }}" hint-placeholder-val="{{ true }}">
      <div class="an-card" style="padding:0 16px">
        <sc-for list="{{ analyticsProducts }}" as="prod" hint-placeholder-count="3">
          <div class="an-list-item bk-row" sc-camel-on-click="{{ prod.open }}" style="cursor:pointer;min-height:44px;gap:12px;background:{{ prod.rowBg }};margin:0 -16px;padding-left:16px;padding-right:16px">
            <div style="display:flex;align-items:flex-start;gap:10px;min-width:0">
              <span style="flex:none;width:10px;height:10px;border-radius:50%;margin-top:5px;background:{{ prod.dotColor }}"></span>
              <div style="min-width:0">
                <div style="font-size:15px;font-weight:500;margin-bottom:2px">{{ prod.name }}</div>
                <div class="text-muted" style="font-size:12px">{{ prod.soldStr }} · {{ prod.shareStr }}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex:none">
              <div style="font-size:16px;font-weight:600;font-feature-settings:'tnum'">{{ prod.revStr }}</div>
              <span class="text-muted" style="font-size:15px">›</span>
            </div>
          </div>
        </sc-for>
      </div>
    </sc-if>
    <sc-if value="{{ hasNoAnyProducts }}" hint-placeholder-val="{{ false }}">
      <div style="text-align:center;padding:50px 20px;background:#fff;border-radius:12px;border:2px dashed var(--color-divider);margin-top:20px">
        <div style="font-size:15px;font-weight:500;margin-bottom:4px">No products yet</div>
        <div style="font-size:13px;color:var(--color-neutral-500);line-height:1.5">Save a recipe and it will show up here with what it earns.</div>
      </div>
    </sc-if>
`;

/** The old rows said everything at once; the page for one product says it. */
function replaceProductsList(template: string): string {
  const start = template.indexOf('    <sc-if value="{{ hasProducts }}" hint-placeholder-val="{{ true }}">');
  if (start < 0) throw new Error("Missing products list anchor");
  const endMark = "    </sc-if>\n  </sc-if>\n\n  <sc-if value=\"{{ analyticsEventsTab }}\"";
  const end = template.indexOf(endMark, start);
  if (end < 0) throw new Error("Missing products list end anchor");
  return template.slice(0, start) + listMarkup + template.slice(end + "    </sc-if>\n".length);
}

const detailMarkup = `<!-- ══ ANALYTICS · ONE PRODUCT ══ -->
<sc-if value="{{ onAnalyticsProduct }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <button class="btn btn-ghost" sc-camel-on-click="{{ backFromAnalyticsDetail }}" style="margin-left:-6px;min-height:44px">‹ Products</button>
  <h2 style="font-size:26px;margin:6px 0 0">{{ productName }}</h2>
  <p class="an-detail-sub">{{ productMonthLabel }}</p>

  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--color-divider);border-radius:var(--radius-md);background:#fff">
    <div style="padding:14px 16px;border-bottom:1px solid var(--color-divider)"><div class="an-stat-label">Sold</div><div class="an-stat-val">{{ productSoldStr }}</div></div>
    <div style="padding:14px 16px;border-bottom:1px solid var(--color-divider);border-left:1px solid var(--color-divider)"><div class="an-stat-label">Earned</div><div class="an-stat-val">{{ productRevStr }}</div></div>
    <div style="padding:14px 16px"><div class="an-stat-label">Share of sales</div><div class="an-stat-val">{{ productShareStr }}</div></div>
    <div style="padding:14px 16px;border-left:1px solid var(--color-divider)"><div class="an-stat-label">Margin</div><div class="an-stat-val">{{ productMarginStr }}</div></div>
  </div>

  <div class="an-section-title">Sold each month</div>
  <div class="an-bar-container">
    <sc-for list="{{ productSoldBars }}" as="bar" hint-placeholder-count="6">
      <div class="an-bar-col">
        <div class="text-muted" style="font-size:10px;font-feature-settings:'tnum';margin-bottom:4px">{{ bar.countStr }}</div>
        <div class="an-bar {{ bar.activeCls }}" style="height:{{ bar.height }}"></div>
        <div class="an-bar-label">{{ bar.label }}</div>
      </div>
    </sc-for>
  </div>

  <div class="an-section-title">What you charged</div>
  <sc-if value="{{ productHasPriceLine }}" hint-placeholder-val="{{ true }}">
    <div class="an-card">
      <svg width="100%" height="90" sc-camel-view-box="0 0 300 90" style="display:block;overflow:visible">
        <polyline points="{{ productPriceLine }}" fill="none" stroke="var(--color-accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
      </svg>
      <div style="display:flex;justify-content:space-between;gap:4px;margin-top:6px">
        <sc-for list="{{ productPriceLabels }}" as="pl" hint-placeholder-count="4">
          <span class="text-muted" style="font-size:11px">{{ pl.label }}</span>
        </sc-for>
      </div>
      <div class="an-meta-row"><span>Charged</span><span>{{ productPriceRangeStr }}</span></div>
      <div class="an-meta-row" style="margin-top:0;border-top:0;padding-top:4px"><span>Saved price · costs to make</span><span>{{ productSavedPriceStr }} · {{ productUnitCostStr }}</span></div>
    </div>
  </sc-if>
  <sc-if value="{{ productHasFlatPrice }}" hint-placeholder-val="{{ false }}">
    <div class="an-card">
      <div style="font-size:14px">Held at {{ productPriceOneStr }} every month it has sold.</div>
      <div class="an-meta-row"><span>Saved price · costs to make</span><span>{{ productSavedPriceStr }} · {{ productUnitCostStr }}</span></div>
    </div>
  </sc-if>
  <sc-if value="{{ productHasOnePrice }}" hint-placeholder-val="{{ false }}">
    <div class="an-card">
      <div style="font-size:14px">Sold at {{ productPriceOneStr }} in the only month it has sold, so there is nothing to compare yet.</div>
      <div class="an-meta-row"><span>Saved price · costs to make</span><span>{{ productSavedPriceStr }} · {{ productUnitCostStr }}</span></div>
    </div>
  </sc-if>
  <sc-if value="{{ productHasNoPrice }}" hint-placeholder-val="{{ false }}">
    <div class="an-card">
      <div class="text-muted" style="font-size:14px">Nothing sold in the last six months, so there is no price history to show.</div>
      <div class="an-meta-row"><span>Saved price · costs to make</span><span>{{ productSavedPriceStr }} · {{ productUnitCostStr }}</span></div>
    </div>
  </sc-if>

  <div class="an-section-title">All time</div>
  <div class="an-card">
    <div class="an-ledger-row"><span>Sold</span><span class="an-num">{{ productLifetimeItemsStr }}</span></div>
    <div class="an-ledger-row"><span>Revenue</span><span class="an-num">{{ productLifetimeRevStr }}</span></div>
    <div class="an-ledger-row"><span>Ingredients and packaging</span><span class="an-num an-neg">−{{ productLifetimeCostStr }}</span></div>
    <div class="an-ledger-total"><span class="an-label">Kept</span><span class="an-total-num">{{ productLifetimeKeptStr }}</span></div>
    <div class="an-meta-row"><span>Margin</span><span>{{ productLifetimeMarginStr }}</span></div>
    <div class="an-meta-row" style="margin-top:0;border-top:0;padding-top:4px"><span>Best month</span><span>{{ productBestMonthStr }}</span></div>
  </div>

  <sc-if value="{{ productNeverSold }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="text-align:center;padding:20px;font-size:13px">This one has not sold yet. It will fill in here once it does.</div>
  </sc-if>
</div>
</sc-if>

`;

/** Sits with the other analytics breakdowns. */
function addProductDetailScreen(template: string): string {
  const anchor = "<!-- ══ ANALYTICS · ITEMS SOLD BREAKDOWN ══ -->";
  if (!template.includes(anchor)) throw new Error("Missing analytics breakdown anchor");
  return template.replace(anchor, () => detailMarkup + anchor);
}

export function applyProductAnalyticsBehavior(template: string): string {
  let out = addProductAnalyticsController(template);
  out = replaceProductsList(out);
  return addProductDetailScreen(out);
}
