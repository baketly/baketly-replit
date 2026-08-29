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
            open: () => this.setState(st => ({
              analyticsProductId: entry.id,
              screen: 'analyticsProduct',
              stack: [...st.stack, st.screen]
            }))
          };
        }).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

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
    <sc-if value="{{ hasAnyProducts }}" hint-placeholder-val="{{ true }}">
      <div class="an-card" style="padding:0 16px">
        <sc-for list="{{ analyticsProducts }}" as="prod" hint-placeholder-count="3">
          <div class="an-list-item bk-row" sc-camel-on-click="{{ prod.open }}" style="cursor:pointer;min-height:44px;gap:12px">
            <div style="min-width:0">
              <div style="font-size:15px;font-weight:500;margin-bottom:2px">{{ prod.name }}</div>
              <div class="text-muted" style="font-size:12px">{{ prod.soldStr }} · {{ prod.shareStr }}</div>
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
