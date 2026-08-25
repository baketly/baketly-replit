export function applyAnalyticsBehavior(template: string): string {
  template = bindUpcomingRow(template);
  const newMarkup = `<!-- ══ ANALYTICS ══ -->
<style>
.an-tabs { display: flex; margin: 0 -20px 16px; padding: 0 10px; border-bottom: 1px solid var(--color-divider); }
.an-tab {
  flex: 1; padding: 12px 0; text-align: center; font-size: 14px; font-weight: 500;
  color: var(--color-neutral-500); cursor: pointer; border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.an-tab.active { color: var(--color-text); border-bottom-color: var(--color-accent); }
.an-card {
  background: #fff; border: 1px solid var(--color-divider); border-radius: 12px;
  padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow-sm);
}
.an-stat-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-neutral-500); margin-bottom: 4px; }
.an-stat-val { font-family: var(--font-heading); font-weight: 600; font-size: 24px; font-feature-settings: 'tnum'; }
.an-stat-sub { font-size: 11px; color: var(--color-neutral-500); margin-top: 4px; }
.an-bar-container { height: 140px; display: flex; align-items: flex-end; gap: 12px; margin-top: 16px; padding-bottom: 24px; border-bottom: 1px solid var(--color-divider); margin-bottom: 24px; }
.an-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
.an-bar { width: 100%; background: var(--color-accent-100); border-radius: 6px 6px 0 0; transition: height 0.4s ease; min-height: 4px; }
.an-bar.active { background: var(--color-accent); }
.an-bar-label { position: absolute; bottom: -24px; font-size: 11px; color: var(--color-neutral-500); white-space: nowrap; }
.an-list-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--color-divider); }
.an-list-item:last-child { border-bottom: none; }
.an-select {
  appearance: none; background: #fff; border: 1px solid var(--color-neutral-300);
  border-radius: 999px; font-family: var(--font-body); font-size: 13px; font-weight: 600;
  color: var(--color-text); padding: 9px 34px 9px 15px; outline: none; cursor: pointer;
  min-height: 38px; box-shadow: var(--shadow-sm);
}
.an-select:focus-visible { border-color: var(--color-accent); }
.an-select-wrap { position: relative; display: inline-block; margin-bottom: 16px; }
.an-select-wrap::after {
  content: '▾'; position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
  font-size: 13px; pointer-events: none; color: var(--color-accent);
}

/* breakdown screens */
.an-detail-sub { font-size: 13px; color: var(--color-neutral-500); margin: 2px 0 20px; }
.an-section-title { font-family: var(--font-heading); font-weight: 600; font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--color-neutral-500); margin: 26px 0 8px; }
.an-num { font-feature-settings: 'tnum'; font-size: 14px; flex: none; }
.an-neg { color: #b0563e; }
.an-ledger-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--color-divider); font-size: 14px; }
.an-ledger-row:last-child { border-bottom: none; }
.an-ledger-total { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 13px 0 2px; margin-top: 5px; border-top: 2px solid var(--color-text); }
.an-ledger-total .an-label { font-weight: 600; font-size: 15px; }
.an-total-num { font-family: var(--font-heading); font-weight: 600; font-size: 22px; font-feature-settings: 'tnum'; }
.an-meta-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 11px; margin-top: 11px; border-top: 1px solid var(--color-divider); font-size: 12px; color: var(--color-neutral-500); }
.an-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--color-divider); }
.an-row:last-child { border-bottom: none; }
.an-row-main { min-width: 0; flex: 1; }
.an-row-name { font-size: 14px; font-weight: 500; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-row-sub { font-size: 12px; color: var(--color-neutral-500); }
.an-row-val { font-feature-settings: 'tnum'; font-size: 14px; font-weight: 500; flex: none; text-align: right; }
.an-mini-bar { height: 6px; border-radius: 3px; background: var(--color-neutral-100); overflow: hidden; margin-top: 8px; }
.an-mini-bar > span { display: block; height: 100%; background: var(--color-accent); border-radius: 3px; }
.an-chips { display: flex; gap: 10px; margin-bottom: 4px; }
.an-chip { flex: 1; background: #fff; border: 1px solid var(--color-divider); border-radius: 12px; padding: 11px 12px; box-shadow: var(--shadow-sm); }
.an-chip-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-neutral-500); margin-bottom: 3px; }
.an-chip-val { font-family: var(--font-heading); font-weight: 600; font-size: 18px; font-feature-settings: 'tnum'; }
</style>
<sc-if value="{{ onAnalytics }}" hint-placeholder-val="{{ false }}">

<div style="padding:18px 20px 28px">
  <h2 style="font-size:28px;margin:0 0 16px">Analytics</h2>

  <div class="an-tabs">
    <div class="an-tab {{ tabOverviewCls }}" sc-camel-on-click="{{ setAnalyticsOverview }}">Overview</div>
    <div class="an-tab {{ tabProductsCls }}" sc-camel-on-click="{{ setAnalyticsProducts }}">Products</div>
    <div class="an-tab {{ tabEventsCls }}" sc-camel-on-click="{{ setAnalyticsEvents }}">Events</div>
  </div>

  <sc-if value="{{ analyticsOverviewTab }}" hint-placeholder-val="{{ true }}">
    <div class="an-select-wrap">
      <select class="an-select" value="{{ analyticsMonth }}" sc-camel-on-change="{{ setAnalyticsMonth }}">
        <sc-for list="{{ monthOptions }}" as="opt" hint-placeholder-count="1">
          <option value="{{ opt.value }}">{{ opt.label }}</option>
        </sc-for>
      </select>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div class="an-card" style="margin-bottom:0;padding:14px;">
        <div class="an-stat-label">Revenue</div>
        <div class="an-stat-val">{{ monthRevStr }}</div>
        <div class="an-stat-sub">{{ monthRevDiff }}</div>
      </div>
      <div class="an-card" sc-camel-on-click="{{ goAnalyticsKept }}" style="margin-bottom:0;padding:14px;cursor:pointer;position:relative;">
        <div class="an-stat-label">Kept</div>
        <div class="an-stat-val">{{ monthProfitStr }}</div>
        <div class="an-stat-sub">after production &amp; event fees ›</div>
      </div>
      <div class="an-card" style="margin-bottom:0;padding:14px;">
        <div class="an-stat-label">Margin</div>
        <div class="an-stat-val">{{ monthMarginStr }}</div>
        <div class="an-stat-sub">labor not set</div>
      </div>
      <div class="an-card" sc-camel-on-click="{{ goAnalyticsItems }}" style="margin-bottom:0;padding:14px;cursor:pointer;position:relative;">
        <div class="an-stat-label">Items Sold</div>
        <div class="an-stat-val">{{ monthItemsStr }}</div>
        <div class="an-stat-sub">in {{ monthSalesCount }} orders ›</div>
      </div>
    </div>

    <div class="an-card" sc-camel-on-click="{{ askAboutInsight }}" style="background:var(--color-bg);border-color:var(--color-accent);border-width:2px;position:relative;overflow:hidden;cursor:pointer;">
      <div style="position:absolute;top:0;right:0;width:60px;height:60px;background:var(--color-accent);opacity:0.05;border-radius:0 0 0 60px;pointer-events:none;"></div>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:16px;margin-bottom:6px;color:var(--color-accent-700)">Baketly noticed</div>
      <div style="font-size:14px;line-height:1.55;color:var(--color-text)">{{ insightText }}</div>
      <div style="font-size:12px;font-weight:600;margin-top:9px;color:var(--color-accent-700)">Ask about this ›</div>
    </div>

    <h6 style="margin-top:28px;margin-bottom:4px;font-size:16px;font-weight:600">Revenue Trends</h6>
    <div class="an-bar-container">
      <sc-for list="{{ chartBars }}" as="bar" hint-placeholder-count="6">
        <div class="an-bar-col" sc-camel-on-click="{{ bar.open }}" style="cursor:pointer">
          <div class="an-bar {{ bar.activeCls }}" style="height:{{ bar.height }}"></div>
          <div class="an-bar-label">{{ bar.label }}</div>
        </div>
      </sc-for>
    </div>
  </sc-if>

  <sc-if value="{{ analyticsProductsTab }}" hint-placeholder-val="{{ false }}">
    <h2 style="font-size:24px;margin:8px 0 4px">Products</h2>
    <p class="text-muted" style="font-size:13px;margin-bottom:20px">Selected month · ranked by revenue.</p>
    <div class="an-select-wrap"><select class="an-select" value="{{ analyticsMonth }}" sc-camel-on-change="{{ setAnalyticsMonth }}"><sc-for list="{{ monthOptions }}" as="opt" hint-placeholder-count="1"><option value="{{ opt.value }}">{{ opt.label }}</option></sc-for></select></div>
    
    <sc-if value="{{ hasProducts }}" hint-placeholder-val="{{ true }}">
      <div class="an-card" style="padding:0 16px;">
        <sc-for list="{{ allTimeProductsArr }}" as="prod" hint-placeholder-count="3">
          <div class="an-list-item">
            <div>
              <div style="font-size:15px;font-weight:500;margin-bottom:2px;">{{ prod.name }}</div>
              <div class="text-muted" style="font-size:12px;">{{ prod.items }} sold · {{ prod.mixStr }}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:600;font-feature-settings:'tnum'">{{ prod.revStr }}</div>
              <div style="font-size:12px;color:{{ prod.marginColor }};font-feature-settings:'tnum';margin-top:2px;">{{ prod.profitStr }} profit · {{ prod.marginStr }} margin</div>
              <div class="text-muted" style="font-size:11px;margin-top:2px">{{ prod.costStr }} production cost</div>
              <div class="text-muted" style="font-size:11px;margin-top:2px">{{ prod.guidance }}</div>
            </div>
          </div>
        </sc-for>
      </div>
    </sc-if>
    <sc-if value="{{ hasNoProducts }}" hint-placeholder-val="{{ false }}">
      <div style="text-align:center;padding:50px 20px;background:#fff;border-radius:12px;border:2px dashed var(--color-divider);margin-top:20px;">
        <div style="width:48px;height:48px;background:var(--color-accent-100);color:var(--color-accent);border-radius:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
        </div>
        <div style="font-size:15px;font-weight:500;margin-bottom:4px;">No products sold this month</div>
        <div style="font-size:13px;color:var(--color-neutral-500);line-height:1.5;">Record a cash sale or complete an event to see your best sellers here.</div>
      </div>
    </sc-if>
  </sc-if>

  <sc-if value="{{ analyticsEventsTab }}" hint-placeholder-val="{{ false }}">
    <h2 style="font-size:24px;margin:8px 0 4px">Event ROI</h2>
    <p class="text-muted" style="font-size:13px;margin-bottom:20px">Profit after booth fees and production costs.</p>
    <div class="an-select-wrap"><select class="an-select" value="{{ analyticsMonth }}" sc-camel-on-change="{{ setAnalyticsMonth }}"><sc-for list="{{ monthOptions }}" as="opt" hint-placeholder-count="1"><option value="{{ opt.value }}">{{ opt.label }}</option></sc-for></select></div>
    
    <sc-if value="{{ hasEvents }}" hint-placeholder-val="{{ true }}">
      <sc-for list="{{ eventsData }}" as="ev" hint-placeholder-count="2">
        <div class="an-card" sc-camel-on-click="{{ ev.open }}" style="cursor:pointer">
          <div style="display:flex;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid var(--color-divider);padding-bottom:14px;">
            <div>
              <div style="font-size:16px;font-weight:600;margin-bottom:2px;">{{ ev.name }}</div>
              <div class="text-muted" style="font-size:12px;">{{ ev.dateStr }}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-neutral-500);margin-bottom:4px;">Profit</div>
              <div style="font-size:20px;font-weight:600;color:{{ ev.profitColor }};font-feature-settings:'tnum'">{{ ev.profitStr }}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 8px;font-size:13px;">
            <div style="display:flex;flex-direction:column;align-items:flex-start;">
              <span class="text-muted" style="font-size:11px;margin-bottom:2px">Rev</span>
              <span style="font-weight:500;font-feature-settings:'tnum'">{{ ev.revStr }}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;">
              <span class="text-muted" style="font-size:11px;margin-bottom:2px">Production</span>
              <span style="font-weight:500;font-feature-settings:'tnum'">{{ ev.productionCostStr }}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-start;">
              <span class="text-muted" style="font-size:11px;margin-bottom:2px">Booth fee</span>
              <span style="font-weight:500;font-feature-settings:'tnum'">{{ ev.boothFeeStr }}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;">
              <span class="text-muted" style="font-size:11px;margin-bottom:2px">ROI · margin</span>
              <span style="font-weight:500;font-feature-settings:'tnum'">{{ ev.roiStr }} · {{ ev.marginStr }}</span>
            </div>
          </div>
        </div>
      </sc-for>
    </sc-if>
    <sc-if value="{{ hasNoEvents }}" hint-placeholder-val="{{ false }}">
      <div style="text-align:center;padding:50px 20px;background:#fff;border-radius:12px;border:2px dashed var(--color-divider);margin-top:20px;">
        <div style="width:48px;height:48px;background:var(--color-accent-100);color:var(--color-accent);border-radius:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path></svg>
        </div>
        <div style="font-size:15px;font-weight:500;margin-bottom:4px;">No events recorded</div>
        <div style="font-size:13px;color:var(--color-neutral-500);line-height:1.5;">Plan and complete an event to see its return on investment.</div>
      </div>
    </sc-if>
  </sc-if>
</div>
</sc-if>

<!-- ══ ANALYTICS · KEPT BREAKDOWN ══ -->
<sc-if value="{{ onAnalyticsKept }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <button class="btn btn-ghost" sc-camel-on-click="{{ backFromAnalyticsDetail }}" style="margin-left:-6px;min-height:44px">‹ Analytics</button>
  <h2 style="font-size:26px;margin:6px 0 0">{{ detailMonthLabel }}</h2>
  <p class="an-detail-sub">Revenue, costs and what you kept.</p>

  <div class="an-card">
    <div class="an-ledger-row"><span>Revenue</span><span class="an-num">{{ monthRevStr }}</span></div>
    <div class="an-ledger-row"><span>Production cost</span><span class="an-num an-neg">−{{ monthCostStr }}</span></div>
    <div class="an-ledger-row"><span>Event costs</span><span class="an-num an-neg">−{{ monthBoothFeesStr }}</span></div>
    <div class="an-ledger-total"><span class="an-label">Kept</span><span class="an-total-num">{{ monthProfitStr }}</span></div>
    <div class="an-meta-row"><span>Margin</span><span>{{ monthMarginStr }}</span></div>
  </div>

  <sc-if value="{{ hasMonthProductRows }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">Products</div>
    <div class="an-card">
      <sc-for list="{{ monthProductRows }}" as="row" hint-placeholder-count="4">
        <div class="an-row">
          <div class="an-row-main">
            <div class="an-row-name">{{ row.name }}</div>
            <div class="an-row-sub">{{ row.sub }}</div>
            <div class="an-mini-bar"><span style="width:{{ row.barWidth }}"></span></div>
          </div>
          <div class="an-row-val">{{ row.valueStr }}</div>
        </div>
      </sc-for>
    </div>
  </sc-if>

  <sc-if value="{{ hasMonthEventRows }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">Events</div>
    <div class="an-card">
      <sc-for list="{{ monthEventRows }}" as="row" hint-placeholder-count="1">
        <div class="an-row" sc-camel-on-click="{{ row.open }}" style="cursor:pointer">
          <div class="an-row-main">
            <div class="an-row-name">{{ row.name }}</div>
            <div class="an-row-sub">{{ row.sub }}</div>
          </div>
          <div class="an-row-val">{{ row.valueStr }}</div>
        </div>
      </sc-for>
    </div>
  </sc-if>

  <sc-if value="{{ hasBoothRows }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">Event costs</div>
    <div class="an-card">
      <sc-for list="{{ boothRows }}" as="fee" hint-placeholder-count="1">
        <div class="an-row">
          <div class="an-row-main">
            <div class="an-row-name">{{ fee.name }}</div>
            <div class="an-row-sub">{{ fee.dateStr }}</div>
          </div>
          <div class="an-row-val">{{ fee.feeStr }}</div>
        </div>
      </sc-for>
    </div>
  </sc-if>

  <sc-if value="{{ hasNoMonthProductRows }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="text-align:center;padding:44px 20px;font-size:13px">No sales recorded for this month yet.</div>
  </sc-if>
</div>
</sc-if>

<!-- ══ ANALYTICS · ITEMS SOLD BREAKDOWN ══ -->
<sc-if value="{{ onAnalyticsItems }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <button class="btn btn-ghost" sc-camel-on-click="{{ backFromAnalyticsDetail }}" style="margin-left:-6px;min-height:44px">‹ Analytics</button>
  <h2 style="font-size:26px;margin:6px 0 0">Items sold</h2>
  <p class="an-detail-sub">{{ detailMonthLabel }}</p>

  <div class="an-chips">
    <div class="an-chip"><div class="an-chip-label">Items</div><div class="an-chip-val">{{ monthItemsStr }}</div></div>
    <div class="an-chip"><div class="an-chip-label">Orders</div><div class="an-chip-val">{{ monthSalesCount }}</div></div>
    <div class="an-chip"><div class="an-chip-label">Products</div><div class="an-chip-val">{{ monthProductCountStr }}</div></div>
  </div>

  <sc-if value="{{ hasGroupRows }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">By group</div>
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
    </div>

    <div class="an-section-title">By product</div>
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
    </div>
  </sc-if>

  <sc-if value="{{ hasNoGroupRows }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="text-align:center;padding:44px 20px;font-size:13px">No items sold in this month yet.</div>
  </sc-if>
</div>
</sc-if>

<!-- ══ ANALYTICS · EVENT BREAKDOWN ══ -->
<sc-if value="{{ onAnalyticsEvent }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <button class="btn btn-ghost" sc-camel-on-click="{{ backFromAnalyticsDetail }}" style="margin-left:-6px;min-height:44px">‹ Analytics</button>
  <sc-if value="{{ hasEventDetail }}" hint-placeholder-val="{{ false }}">
    <h2 style="font-size:26px;margin:6px 0 0">{{ eventDetailName }}</h2>
    <p class="an-detail-sub">{{ eventDetailDateStr }}</p>

    <div class="an-card">
      <div class="an-ledger-row"><span>Revenue</span><span class="an-num">{{ eventDetailRevStr }}</span></div>
      <div class="an-ledger-row"><span>Production cost</span><span class="an-num an-neg">−{{ eventDetailProductionStr }}</span></div>
      <div class="an-ledger-row"><span>Event costs</span><span class="an-num an-neg">−{{ eventDetailCostsStr }}</span></div>
      <div style="padding:2px 0 10px"><button class="btn btn-ghost" sc-camel-on-click="{{ toggleEventCosts }}" style="min-height:32px;padding:0;font-size:12px;font-weight:600;color:var(--color-accent-700)">{{ eventCostsToggleLabel }} ▾</button></div>
      <sc-if value="{{ eventCostsOpen }}" hint-placeholder-val="{{ false }}">
        <sc-for list="{{ eventDetailCostLines }}" as="cl" hint-placeholder-count="2">
          <div class="an-ledger-row" style="padding-left:14px"><span class="text-muted" style="font-size:13px">{{ cl.label }}</span><span class="an-num text-muted" style="font-size:13px">{{ cl.amountStr }}</span></div>
        </sc-for>
      </sc-if>
      <div class="an-ledger-total"><span class="an-label">Profit</span><span class="an-total-num" style="color:{{ eventDetailProfitColor }}">{{ eventDetailProfitStr }}</span></div>
      <div class="an-meta-row"><span>ROI</span><span>{{ eventDetailRoiStr }}</span></div>
      <div class="an-meta-row" style="margin-top:0;border-top:none;padding-top:5px"><span>Margin</span><span>{{ eventDetailMarginStr }}</span></div>
    </div>

    <sc-if value="{{ hasEventDetailItems }}" hint-placeholder-val="{{ false }}">
      <div class="an-section-title">Sold at this market</div>
      <div class="an-card">
        <sc-for list="{{ eventDetailItems }}" as="row" hint-placeholder-count="5">
          <div class="an-row">
            <div class="an-row-main">
              <div class="an-row-name">{{ row.name }}</div>
              <div class="an-row-sub">{{ row.soldOfPlanned }} · {{ row.profitStr }} profit</div>
              <div class="an-mini-bar"><span style="width:{{ row.rateWidth }}"></span></div>
            </div>
            <div class="an-row-val">{{ row.revStr }}<div class="an-row-sub" style="margin-top:3px">{{ row.rateStr }} sold</div></div>
          </div>
        </sc-for>
      </div>
    </sc-if>

    <sc-if value="{{ eventSellThroughShown }}" hint-placeholder-val="{{ false }}">
      <div class="an-section-title">Sold against what you made</div>
      <div class="an-card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
          <span style="font-family:var(--font-heading);font-weight:600;font-size:22px;font-feature-settings:'tnum'">{{ eventSoldTotalStr }} of {{ eventPlannedTotalStr }}</span>
          <span style="font-family:var(--font-heading);font-weight:600;font-size:20px;font-feature-settings:'tnum'">{{ eventSellThroughStr }}</span>
        </div>
        <div class="an-mini-bar" style="height:8px"><span style="width:{{ eventSellThroughWidth }}"></span></div>
        <div class="text-muted" style="font-size:12px;margin-top:8px">{{ eventLeftoverStr }}</div>
      </div>
    </sc-if>

    <sc-if value="{{ hasNoEventDetailItems }}" hint-placeholder-val="{{ false }}">
      <div class="text-muted" style="text-align:center;padding:44px 20px;font-size:13px">Nothing was recorded as sold at this market.</div>
    </sc-if>
  </sc-if>

  <sc-if value="{{ hasNoEventDetail }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="text-align:center;padding:44px 20px;font-size:13px">That event is no longer available.</div>
  </sc-if>
</div>
</sc-if>
<!-- ══`;

  const newLogic = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const events = Array.isArray(this.state.eventRecords) ? this.state.eventRecords : [];
        const sales = Array.isArray(this.state.saleRecords) ? this.state.saleRecords : [];

        const otherCostTotal = (event) => (Array.isArray(event && event.otherCosts) ? event.otherCosts : [])
          .reduce((sum, cost) => sum + (Number(cost && cost.amount) || 0), 0);

        const now = new Date();
        const currentMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        
        const salesByMonth = {};
        sales.forEach(sale => {
          if (!sale.occurredAt) return;
          const d = new Date(sale.occurredAt);
          const month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          if (!salesByMonth[month]) salesByMonth[month] = { revenue: 0, cost: 0, items: 0, count: 0, products: {} };
          
          salesByMonth[month].revenue += (Number(sale.total) || 0);
          salesByMonth[month].count += 1;
          (sale.lineItems || []).forEach(li => {
            const qty = Number(li.quantity) || 0;
            const cost = Number(li.unitCost) || 0;
            const price = Number(li.unitPrice) || 0;
            salesByMonth[month].cost += (qty * cost);
            salesByMonth[month].items += qty;
            
            if (!salesByMonth[month].products[li.productId]) {
              salesByMonth[month].products[li.productId] = { name: li.name || 'Unknown', revenue: 0, items: 0, cost: 0 };
            }
            salesByMonth[month].products[li.productId].revenue += (qty * price);
            salesByMonth[month].products[li.productId].items += qty;
            salesByMonth[month].products[li.productId].cost += (qty * cost);
          });
        });

         const monthKeys = new Set(Object.keys(salesByMonth));
         for (let i = 5; i >= 0; i--) {
           const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
           monthKeys.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
         }
         events.forEach(ev => {
           if (!ev.occurredAt) return;
           const d = new Date(ev.occurredAt);
           if (!isNaN(d.getTime())) monthKeys.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
         });
        monthKeys.add(currentMonthKey);
        const sortedMonths = Array.from(monthKeys).sort().reverse();
        
        const formatMonth = (isoStr) => {
          const y = parseInt(isoStr.split('-')[0]);
          const m = parseInt(isoStr.split('-')[1]) - 1;
          const d = new Date(y, m);
          return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        };
        
        const monthOptions = sortedMonths.map(m => ({ value: m, label: formatMonth(m) }));
        const selectedMonth = this.state.analyticsMonth || currentMonthKey;
        
        const monthData = salesByMonth[selectedMonth] || { revenue: 0, cost: 0, items: 0, count: 0, products: {} };
        const monthRev = monthData.revenue;
        const monthCost = monthData.cost;
         const monthEventList = events.filter(ev => (ev.occurredAt || '').slice(0, 7) === selectedMonth);
         const monthBoothFees = monthEventList.reduce((sum, ev) => sum + (Number(ev.boothFee) || 0) + otherCostTotal(ev), 0);
         const monthProfit = monthRev - monthCost - monthBoothFees;
        const monthMargin = monthRev > 0 ? Math.round((monthProfit / monthRev) * 100) : 0;
        
        let monthRevDiff = 'No previous data';
        const sortedAsc = [...sortedMonths].reverse();
        const mIdx = sortedAsc.indexOf(selectedMonth);
        if (mIdx > 0) {
          let prevRev = 0;
          for (let i = mIdx - 1; i >= 0 && prevRev === 0; i--) {
            const candidate = sortedAsc[i];
            prevRev = salesByMonth[candidate] ? salesByMonth[candidate].revenue : 0;
          }
          if (prevRev > 0) {
            const diff = Math.round(((monthRev - prevRev) / prevRev) * 100);
            monthRevDiff = (diff >= 0 ? '↑' : '↓') + Math.abs(diff) + '% vs prev';
          }
        }
        
        const productsArr = Object.values(monthData.products).sort((a, b) => b.revenue - a.revenue);
        let insightText = "You haven't recorded any sales this month yet. Start tracking cash or POS orders to see insights.";
        if (productsArr.length > 0) {
          const topProduct = productsArr[0];
          const lowMargin = productsArr.find(p => p.revenue > 0 && ((p.revenue - p.cost) / p.revenue) < 0.4);
          if (lowMargin) {
            const margin = Math.round(((lowMargin.revenue - lowMargin.cost) / lowMargin.revenue) * 100);
            insightText = topProduct.name + ' is driving revenue, but ' + lowMargin.name + ' has a low margin of ' + margin + '%. Consider raising its price or tweaking the recipe.';
          } else {
            const slowProduct = productsArr[productsArr.length - 1];
            insightText = topProduct.name + ' is your best earner this month. ' + (slowProduct && slowProduct !== topProduct ? slowProduct.name + ' is the slowest seller at ' + slowProduct.items + ' units, so keep its next bake conservative.' : 'Margins are healthy; keep watching sell-through before increasing the next batch.');
          }
        }

        const last6Months = [];
        for(let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          last6Months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
        }
        let maxRev = 0;
        last6Months.forEach(m => {
          const rev = salesByMonth[m] ? salesByMonth[m].revenue : 0;
          if (rev > maxRev) maxRev = rev;
        });
        const chartBars = last6Months.map(m => {
          const rev = salesByMonth[m] ? salesByMonth[m].revenue : 0;
          const y = parseInt(m.split('-')[0]);
          const mo = parseInt(m.split('-')[1]) - 1;
          const d = new Date(y, mo);
          return {
            label: d.toLocaleString('en-US', { month: 'short' }),
            val: rev,
            height: maxRev > 0 ? Math.max(4, Math.round((rev / maxRev) * 100)) + '%' : '4px',
            activeCls: m === selectedMonth ? 'active' : '',
            open: () => this.setState(st => ({ analyticsMonth: m, screen: 'analyticsKept', stack: [...st.stack, st.screen] }))
          };
        });

         const allTimeProductsArr = Object.entries(monthData.products).map(([productId, p]) => {
          const margin = p.revenue > 0 ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : 0;
           const recipe = (this.state.recipeRecords || []).find(r => r.id === productId);
           const currentCost = recipe ? (((recipe.ingredientKeys || []).reduce((sum, key) => sum + (Number((recipe.amounts || {})[key]) || 0) * (this.ING_META[key] ? this.ING_META[key].per : 0), 0) / Math.max(1, Number(recipe.yield) || 1)) + (recipe.packagingKeys || []).reduce((sum, key) => sum + (this.PACK_META[key] ? this.PACK_META[key].per : 0), 0)) : 0;
           const target = currentCost > 0 ? currentCost / .4 : 0;
          return {
            ...p,
            revStr: CUR + p.revenue.toFixed(2),
             costStr: CUR + p.cost.toFixed(2),
              profitStr: (p.revenue - p.cost < 0 ? ('-' + CUR) : CUR) + Math.abs(p.revenue - p.cost).toFixed(2),
             mixStr: monthRev > 0 ? Math.round(p.revenue / monthRev * 100) + '% of sales' : '0% of sales',
             guidance: recipe && Number(recipe.price) < target ? ('Current price is below a 60% margin target (~' + CUR) + target.toFixed(2) + ').' : (recipe ? 'Current saved price supports the 60% margin target.' : 'Historical product; no saved recipe price to compare.'),
            marginStr: margin + '%',
            marginColor: margin >= 60 ? 'var(--color-neutral-700)' : '#b0563e'
          };
        }).sort((a, b) => b.revenue - a.revenue);

         const buildEventStats = (ev) => {
          const evSales = sales.filter(s => s.eventId === ev.id);
          const evRev = evSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
            const productionCost = evSales.reduce((sum, sale) => sum + (sale.lineItems || []).reduce((lineSum, li) => lineSum + (Number(li.quantity) || 0) * (Number(li.unitCost) || 0), 0), 0);
            const boothFee = Number(ev.boothFee || 0);
            const otherCosts = otherCostTotal(ev);
            const evCost = boothFee + otherCosts + productionCost;
          const evProfit = evRev - evCost;
          const evMargin = evRev > 0 ? Math.round((evProfit / evRev) * 100) : 0;
            const evRoi = evCost > 0 ? Math.round((evProfit / evCost) * 100) : 0;
          return {
            ...ev,
            revStr: CUR + evRev.toFixed(2),
           costStr: CUR + evCost.toFixed(2),
             productionCostStr: CUR + productionCost.toFixed(2),
             boothFeeStr: CUR + boothFee.toFixed(2),
             allCostsStr: CUR + (boothFee + otherCosts).toFixed(2),
             costLines: [{ label: 'Booth fee', amountStr: CUR + boothFee.toFixed(2) }].concat(
               (Array.isArray(ev.otherCosts) ? ev.otherCosts : []).map(cost => ({
                 label: String((cost && cost.label) || 'Other cost'),
                 amountStr: CUR + (Number(cost && cost.amount) || 0).toFixed(2)
               }))
             ),
             otherCostsStr: CUR + otherCosts.toFixed(2),
             hasOtherCosts: otherCosts > 0,
             otherCostRows: (Array.isArray(ev.otherCosts) ? ev.otherCosts : []).map(cost => ({
               label: String((cost && cost.label) || 'Other cost'),
               amountStr: CUR + (Number(cost && cost.amount) || 0).toFixed(2)
             })),
            revenueValue: evRev,
            profitValue: evProfit,
            profitStr: (evProfit >= 0 ? CUR : ('-' + CUR)) + Math.abs(evProfit).toFixed(2),
            profitColor: evProfit >= 0 ? 'var(--color-text)' : '#b0563e',
            marginStr: evMargin + '%',
             roiStr: evRoi + '%',
            dateStr: new Date(ev.occurredAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            open: () => this.setState(st => ({ screen: 'analyticsEvent', stack: [...st.stack, st.screen], analyticsEventId: ev.id, eventCostsOpen: false }))
          };
        };
        const eventsData = events
          .filter(ev => (ev.occurredAt || '').slice(0, 7) === selectedMonth)
          .map(buildEventStats)
          .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime());

        // looked up across every event, not just the selected month
        const detailEventRaw = events.find(ev => ev.id === (this.state.analyticsEventId || '')) || null;
        const eventDetail = detailEventRaw ? buildEventStats(detailEventRaw) : null;
        const eventDetailTotals = {};
        if (eventDetail) {
          sales.filter(sale => sale.eventId === eventDetail.id).forEach(sale => {
            (sale.lineItems || []).forEach(li => {
              const key = li.productId || li.name;
              if (!eventDetailTotals[key]) eventDetailTotals[key] = { name: li.name || 'Item', items: 0, revenue: 0, cost: 0 };
              const quantity = Number(li.quantity) || 0;
              eventDetailTotals[key].items += quantity;
              eventDetailTotals[key].revenue += quantity * (Number(li.unitPrice) || 0);
              eventDetailTotals[key].cost += quantity * (Number(li.unitCost) || 0);
            });
          });
        }
        const plannedByProduct = {};
        if (detailEventRaw && Array.isArray(detailEventRaw.plannedItems)) {
          detailEventRaw.plannedItems.forEach(item => {
            const key = (item && item.productId) || (item && item.name);
            if (key) plannedByProduct[key] = Math.max(0, Number(item.quantity) || 0);
          });
        }
        // a product baked for the market but never sold still belongs in the list
        Object.keys(plannedByProduct).forEach(key => {
          if (!eventDetailTotals[key]) {
            const planned = (detailEventRaw.plannedItems || []).find(item => ((item && item.productId) || (item && item.name)) === key);
            eventDetailTotals[key] = { name: (planned && planned.name) || 'Item', items: 0, revenue: 0, cost: 0 };
          }
        });
        const eventItemEntries = Object.entries(eventDetailTotals)
          .map(([key, row]) => ({ ...row, planned: plannedByProduct[key] || 0 }))
          .sort((a, b) => b.revenue - a.revenue);
        const plannedTotal = eventItemEntries.reduce((sum, row) => sum + row.planned, 0);
        const soldTotal = eventItemEntries.reduce((sum, row) => sum + row.items, 0);
        const leftoverTotal = Math.max(0, plannedTotal - soldTotal);
        const sellThroughPct = plannedTotal > 0 ? Math.round((soldTotal / plannedTotal) * 100) : 0;
        const maxEventItemRev = eventItemEntries.reduce((max, row) => Math.max(max, row.revenue), 0);
        const eventDetailItems = eventItemEntries.map(row => ({
          name: row.name,
          soldOfPlanned: row.planned > 0
            ? row.items + ' sold of ' + row.planned + ' made'
            : row.items + (row.items === 1 ? ' unit sold' : ' units sold'),
          rateStr: row.planned > 0 ? Math.round((row.items / row.planned) * 100) + '%' : '—',
          rateWidth: row.planned > 0 ? Math.min(100, Math.max(3, Math.round((row.items / row.planned) * 100))) + '%' : '0%',
          hasRate: row.planned > 0,
          unitsStr: row.items + (row.items === 1 ? ' unit' : ' units'),
          revStr: CUR + row.revenue.toFixed(2),
          profitStr: (row.revenue - row.cost < 0 ? ('-' + CUR) : CUR) + Math.abs(row.revenue - row.cost).toFixed(2),
          barWidth: (maxEventItemRev > 0 ? Math.max(3, Math.round((row.revenue / maxEventItemRev) * 100)) : 3) + '%'
        }));

        const groupLabels = { bread: 'Bread', babka: 'Babka', cookie: 'Cookies', treat: 'Treats', other: 'Other' };
        const productEntries = Object.entries(monthData.products);

        const boothRows = events
          .filter(ev => (ev.occurredAt || '').slice(0, 7) === selectedMonth)
          .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime())
          .map(ev => ({
            name: ev.name || 'Market',
            dateStr: new Date(ev.occurredAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              + (otherCostTotal(ev) > 0 ? (' · booth ' + CUR) + (Number(ev.boothFee) || 0).toFixed(2) + (' + other ' + CUR) + otherCostTotal(ev).toFixed(2) : ''),
            feeStr: CUR + ((Number(ev.boothFee) || 0) + otherCostTotal(ev)).toFixed(2)
          }));

        const groupTotals = {};
        productEntries.forEach(([productId, p]) => {
          const recipe = (this.state.recipeRecords || []).find(r => r.id === productId);
          const key = recipe && groupLabels[recipe.type] ? recipe.type : 'other';
          if (!groupTotals[key]) groupTotals[key] = { items: 0, revenue: 0, products: 0 };
          groupTotals[key].items += p.items;
          groupTotals[key].revenue += p.revenue;
          groupTotals[key].products += 1;
        });
        const groupEntries = Object.entries(groupTotals).sort((a, b) => b[1].items - a[1].items);
        const maxGroupItems = groupEntries.reduce((max, [, g]) => Math.max(max, g.items), 0);
        const groupRows = groupEntries.map(([key, g]) => ({
          label: groupLabels[key] || 'Other',
          unitsStr: g.items + (g.items === 1 ? ' unit' : ' units'),
          shareStr: (monthData.items > 0 ? Math.round((g.items / monthData.items) * 100) : 0) + '%',
          barWidth: (maxGroupItems > 0 ? Math.max(4, Math.round((g.items / maxGroupItems) * 100)) : 4) + '%',
          revStr: CUR + g.revenue.toFixed(2),
          sub: g.products + (g.products === 1 ? ' product' : ' products')
        }));

        const revenueEntries = productEntries
          .map(([, product]) => product)
          .sort((a, b) => b.revenue - a.revenue);
        const maxProductRevenue = revenueEntries.reduce((max, product) => Math.max(max, product.revenue), 0);
        const monthProductRows = revenueEntries.map(product => ({
          name: product.name,
          sub: product.items + ' sold · ' + CUR + product.cost.toFixed(2) + ' to make · '
            + (product.revenue > 0 ? Math.round(((product.revenue - product.cost) / product.revenue) * 100) : 0) + '% margin',
          valueStr: CUR + product.revenue.toFixed(2),
          barWidth: (maxProductRevenue > 0 ? Math.max(3, Math.round((product.revenue / maxProductRevenue) * 100)) : 3) + '%'
        }));

        const itemEntries = productEntries.map(([, p]) => p).sort((a, b) => b.items - a.items);
        const maxProductItems = itemEntries.reduce((max, p) => Math.max(max, p.items), 0);
        const itemProductRows = itemEntries.map(p => ({
          name: p.name,
          unitsStr: String(p.items),
          revStr: CUR + p.revenue.toFixed(2),
          shareStr: (monthData.items > 0 ? Math.round((p.items / monthData.items) * 100) : 0) + '%',
          barWidth: (maxProductItems > 0 ? Math.max(3, Math.round((p.items / maxProductItems) * 100)) : 3) + '%'
        }));

        const nowMs = Date.now();
        const thisYear = now.getFullYear();
        const allPastEventStats = events
          .filter(ev => new Date(ev.occurredAt || 0).getTime() <= nowMs)
          .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime())
          .map(buildEventStats);
        const allPastEvents = allPastEventStats
          .map(ev => {
            const when = new Date(ev.occurredAt || Date.now());
            return {
              periodKey: (ev.occurredAt || '').slice(0, 7),
              monthStr: when.toLocaleString('en-US', { month: 'short' }),
              dayStr: String(when.getDate()),
              // only worth showing once the list spans more than this year
              yearStr: when.getFullYear() === thisYear ? '' : String(when.getFullYear()),
              name: ev.name || 'Market',
              subStr: 'kept ' + ev.profitStr + ' · ' + ev.marginStr + ' margin',
              revStr: ev.revStr,
              open: ev.open
            };
          });

        // jump straight to a month instead of scrolling a long history
        const marketsPeriod = this.state.marketsPeriod || 'all';
        const pastPeriodKeys = [...new Set(allPastEvents.map(ev => ev.periodKey).filter(Boolean))];
        const pastEventPeriods = [{ value: 'all', label: 'All time' }]
          .concat(pastPeriodKeys.map(key => ({ value: key, label: formatMonth(key) })));
        const periodStillExists = marketsPeriod === 'all' || pastPeriodKeys.includes(marketsPeriod);
        const activePeriod = periodStillExists ? marketsPeriod : 'all';
        const pastEvents = activePeriod === 'all'
          ? allPastEvents
          : allPastEvents.filter(ev => ev.periodKey === activePeriod);
        const pastEventsCountLabel = pastEvents.length === 1
          ? '1 event'
          : pastEvents.length + ' events';

        // the same events the Events tab shows, reused on the month screen
        const monthEventRows = eventsData.map(ev => ({
          name: ev.name || 'Market',
          sub: ev.dateStr + ' · kept ' + ev.profitStr + ' · ' + ev.roiStr + ' return',
          valueStr: ev.revStr,
          open: ev.open
        }));

        const rankedPastEvents = allPastEventStats
          .slice()
          .sort((a, b) => b.profitValue - a.profitValue);
        let marketsInsightText = 'Add a market and I will tell you whether the table paid for itself.';
        if (rankedPastEvents.length === 1) {
          const only = rankedPastEvents[0];
          marketsInsightText = only.name + ' kept ' + only.profitStr + ' after costs, a ' + only.roiStr + ' return on what it took to be there.';
        } else if (rankedPastEvents.length > 1) {
          const best = rankedPastEvents[0];
          const worst = rankedPastEvents[rankedPastEvents.length - 1];
          const gap = best.profitValue - worst.profitValue;
          marketsInsightText = best.name + ' is your most profitable market, keeping ' + best.profitStr + ' at a ' + best.roiStr + ' return'
            + (gap > 0 ? (' — about ' + CUR) + gap.toFixed(2) + ' more than ' + worst.name + '.' : '.');
        }

        const tab = this.state.analyticsTab || 'overview';

        return {
          analyticsOverviewTab: tab === 'overview',
          analyticsProductsTab: tab === 'products',
          analyticsEventsTab: tab === 'events',
          tabOverviewCls: tab === 'overview' ? 'active' : '',
          tabProductsCls: tab === 'products' ? 'active' : '',
          tabEventsCls: tab === 'events' ? 'active' : '',
          setAnalyticsOverview: () => this.setState({ analyticsTab: 'overview' }),
          setAnalyticsProducts: () => this.setState({ analyticsTab: 'products' }),
          setAnalyticsEvents: () => this.setState({ analyticsTab: 'events' }),
          analyticsMonth: selectedMonth,
          setAnalyticsMonth: (e) => this.setState({ analyticsMonth: e.target.value }),
          monthOptions,
          monthRevStr: CUR + monthRev.toFixed(2),
           monthProfitStr: (monthProfit < 0 ? ('-' + CUR) : CUR) + Math.abs(monthProfit).toFixed(2),
          monthMarginStr: monthMargin + '%',
          monthItemsStr: String(monthData.items),
          monthSalesCount: String(monthData.count),
          monthRevDiff,
          detailMonthLabel: formatMonth(selectedMonth),
          monthCostStr: CUR + monthCost.toFixed(2),
          monthBoothFeesStr: CUR + monthBoothFees.toFixed(2),
          monthProductRows,
          hasMonthProductRows: monthProductRows.length > 0,
          hasNoMonthProductRows: monthProductRows.length === 0,
          monthEventRows,
          hasMonthEventRows: monthEventRows.length > 0,
          boothRows,
          hasBoothRows: boothRows.length > 0,
          groupRows,
          hasGroupRows: groupRows.length > 0,
          hasNoGroupRows: groupRows.length === 0,
          itemProductRows,
          pastEvents,
          hasPastEvents: pastEvents.length > 0,
          hasNoPastEvents: pastEvents.length === 0,
          pastEventPeriods,
          marketsPeriod: activePeriod,
          pastEventsCountLabel,
          hasPastEventPeriods: pastPeriodKeys.length > 1,
          setMarketsPeriod: e => this.setState({ marketsPeriod: e.target.value }),
          monthGroupCountStr: String(groupRows.length),
          monthProductCountStr: String(productEntries.length),
          eventDetailItemCountStr: String(eventDetailItems.reduce((sum, row) => sum + (parseInt(row.unitsStr, 10) || 0), 0)),
          hasEventDetail: !!eventDetail,
          hasNoEventDetail: !eventDetail,
          hasEventDetailItems: eventDetailItems.length > 0,
          hasNoEventDetailItems: !!eventDetail && eventDetailItems.length === 0,
          eventDetailItems,
          eventSellThroughShown: !!eventDetail && plannedTotal > 0,
          eventSoldTotalStr: String(soldTotal),
          eventPlannedTotalStr: String(plannedTotal),
          eventLeftoverStr: leftoverTotal + (leftoverTotal === 1 ? ' unit left over' : ' units left over'),
          eventSellThroughStr: sellThroughPct + '%',
          eventSellThroughWidth: Math.min(100, Math.max(3, sellThroughPct)) + '%',
          eventDetailName: eventDetail ? eventDetail.name : '',
          eventDetailDateStr: eventDetail ? eventDetail.dateStr : '',
          eventDetailRevStr: eventDetail ? eventDetail.revStr : (CUR + '0.00'),
          eventDetailProductionStr: eventDetail ? eventDetail.productionCostStr : (CUR + '0.00'),
          eventDetailCostsStr: eventDetail ? eventDetail.allCostsStr : (CUR + '0.00'),
          eventDetailCostLines: eventDetail ? eventDetail.costLines : [],
          eventCostsOpen: this.state.eventCostsOpen === true,
          eventCostsToggleLabel: this.state.eventCostsOpen === true ? 'Hide the breakdown' : 'Show the breakdown',
          toggleEventCosts: () => this.setState(st => ({ eventCostsOpen: !st.eventCostsOpen })),
          eventDetailProfitStr: eventDetail ? eventDetail.profitStr : (CUR + '0.00'),
          eventDetailProfitColor: eventDetail ? eventDetail.profitColor : 'var(--color-text)',
          eventDetailRoiStr: eventDetail ? eventDetail.roiStr : '0%',
          eventDetailMarginStr: eventDetail ? eventDetail.marginStr : '0%',
          insightText,
          marketsInsightText,
          askAboutInsight: () => this.__baketlyAskFromCard('Tell me more about this, and what you would do about it: ' + insightText),
          askAboutMarketsInsight: () => this.__baketlyAskFromCard('Tell me more about this, and what you would do about it: ' + marketsInsightText),
          chartBars,
          allTimeProductsArr,
          hasProducts: allTimeProductsArr.length > 0,
          hasNoProducts: allTimeProductsArr.length === 0,
          eventsData,
          hasEvents: eventsData.length > 0,
          hasNoEvents: eventsData.length === 0
        };
      })(),
      onAnalytics: screen === 'analytics', goAnalytics: () => this.setState(st => ({ screen: 'analytics', stack: [...st.stack, st.screen], analyticsTab: 'overview' })),
      onAnalyticsKept: screen === 'analyticsKept',
      onAnalyticsItems: screen === 'analyticsItems',
      onAnalyticsEvent: screen === 'analyticsEvent',
      goAnalyticsKept: () => this.setState(st => ({ screen: 'analyticsKept', stack: [...st.stack, st.screen] })),
      goAnalyticsItems: () => this.setState(st => ({ screen: 'analyticsItems', stack: [...st.stack, st.screen] })),
      backFromAnalyticsDetail: () => this.setState(st => { const stack = [...st.stack]; const previous = stack.pop() || 'analytics'; return { screen: previous, stack }; }),`;

  let out = addCommerceBehavior(template).replace(/<!-- ══ ANALYTICS ══ -->[\s\S]*?<!-- ══/, () => newMarkup);
  
  // Use replace with a callback to avoid matching issues with $ characters in the replacement string
  out = out.replace(/onAnalytics:\s*screen\s*===\s*'analytics',\s*goAnalytics:\s*mk\('analytics'\),/, () => newLogic);
  
  return out;
}


const pastEventsMarkup = `  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:2px">
    <h6 style="margin:0">Past events</h6>
    <sc-if value="{{ hasPastEventPeriods }}" hint-placeholder-val="{{ false }}">
      <div class="an-select-wrap" style="margin-bottom:0"><select class="an-select" value="{{ marketsPeriod }}" sc-camel-on-change="{{ setMarketsPeriod }}" aria-label="Jump to a period"><sc-for list="{{ pastEventPeriods }}" as="pp" hint-placeholder-count="3"><option value="{{ pp.value }}">{{ pp.label }}</option></sc-for></select></div>
    </sc-if>
  </div>
  <div class="text-muted" style="font-size:12px;margin-bottom:6px">{{ pastEventsCountLabel }}</div>
  <div style="display:flex;flex-direction:column">
    <sc-for list="{{ pastEvents }}" as="pe" hint-placeholder-count="3">
      <div class="bk-row" sc-camel-on-click="{{ pe.open }}" style="display:flex;align-items:center;gap:14px;padding:14px 0;border-top:1px solid var(--color-divider);cursor:pointer">
        <div style="text-align:center;flex:none;width:44px"><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-600)">{{ pe.monthStr }}</div><div style="font-family:var(--font-heading);font-weight:600;font-size:22px;line-height:1;font-feature-settings:'tnum'">{{ pe.dayStr }}</div><div class="text-muted" style="font-size:10px;font-feature-settings:'tnum'">{{ pe.yearStr }}</div></div>
        <div style="flex:1;min-width:0"><div style="font-family:var(--font-heading);font-weight:600;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ pe.name }}</div><div class="text-muted" style="font-size:12px">{{ pe.subStr }}</div></div>
        <div style="text-align:right;flex:none;font-feature-settings:'tnum';font-size:15px">{{ pe.revStr }}</div>
      </div>
    </sc-for>
    <sc-if value="{{ hasNoPastEvents }}" hint-placeholder-val="{{ false }}">
      <div class="text-muted" style="padding:18px 0;font-size:13px;border-top:1px solid var(--color-divider)">No past events yet.</div>
    </sc-if>
  </div>

`;

// The mockup shipped three invented past events as literal markup. Swap the
// whole block for the real ones, each opening its own breakdown.
function replacePastEvents(template: string): string {
  const startMarker = '  <h6 style="margin-bottom:8px">Past events</h6>';
  const endMarker = '  <div class="card" style="margin-top:20px;';
  const start = template.indexOf(startMarker);
  const end = template.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error("Missing stable past-events anchor");
  }
  return template.slice(0, start) + pastEventsMarkup + template.slice(end);
}

// Cash tracking is being retired: the event screen keeps pre-orders only.
function removeCashTracker(template: string): string {
  const cashButton =
    '    <button class="btn btn-secondary" sc-camel-on-click="{{ goCash }}" style="flex:1;min-height:52px;flex-direction:column;gap:2px"><span>Cash tracker</span><span class="text-muted" style="font-size:11px;font-feature-settings:\'tnum\'">{{ cashCollected }} collected</span></button>\n';
  const cashSummaryRow =
    '        <div style="display:flex;justify-content:space-between;padding:11px 16px;border-top:1px solid var(--color-divider);font-size:13px"><span class="text-muted">Cash tracker orders</span><span style="font-feature-settings:\'tnum\'">{{ cashCollected }}</span></div>\n';
  const staleProfitCopy =
    "Actual profit compares revenue with the plan's estimated production cost — booth fee, travel and labor not included.";
  const staleCashCopy =
    'Enter quantities sold. Skip anything already recorded order-by-order in the Cash Tracker — otherwise it counts twice.';
  for (const [fragment, label] of [
    [cashButton, "cash tracker button"],
    [cashSummaryRow, "cash tracker summary row"],
    [staleCashCopy, "stale cash tracker copy"],
    [staleProfitCopy, "stale event profit copy"],
  ] as const) {
    if (!template.includes(fragment)) {
      throw new Error(`Missing stable ${label} anchor`);
    }
    template = template.replace(fragment, () => {
      if (fragment === staleCashCopy) return "Enter the quantities you sold.";
      // booth fee and any other costs are now subtracted here
      if (fragment === staleProfitCopy) return "Actual profit takes off what you baked, the booth fee and any other costs you listed. Labor is not included.";
      return "";
    });
  }

  const screenStart = template.indexOf("<!-- ══ CASH TRACKER ══ -->");
  if (screenStart === -1) throw new Error("Missing cash tracker screen anchor");
  const screenEnd = template.indexOf("<!-- ══", screenStart + 10);
  if (screenEnd === -1) throw new Error("Unclosed cash tracker screen");
  template = template.slice(0, screenStart) + template.slice(screenEnd);

  // Actual revenue needs no change: an earlier pass already rewrote
  // updateRevenue to total the sales linked to the event rather than adding a
  // separate cash figure.
  return template;
}

// The mockup's two "Baketly noticed" cards held invented copy and did nothing.
// They now show a real tip and open the chat with it.
const eventCostEditorMarkup = `
  <div style="border-top:1px solid var(--color-divider);padding-top:16px;margin-top:4px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px">
      <h6 style="margin:0">Other costs</h6>
      <sc-if value="{{ hasEventOtherCosts }}" hint-placeholder-val="{{ false }}"><span class="text-muted" style="font-size:12px;font-feature-settings:'tnum'">{{ eventOtherCostTotalStr }}</span></sc-if>
    </div>
    <p class="text-muted" style="font-size:12px;margin-bottom:10px">Travel, parking, a helper's hours — anything the table cost you beyond the booth fee.</p>
    <sc-for list="{{ eventOtherCosts }}" as="oc" hint-placeholder-count="0">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input class="input" value="{{ oc.label }}" sc-camel-on-change="{{ oc.setLabel }}" placeholder="Travel, parking, staff…" aria-label="Cost name" style="flex:1;min-width:0">
        <input class="input" value="{{ oc.amount }}" sc-camel-on-change="{{ oc.setAmount }}" inputmode="decimal" placeholder="0.00" aria-label="Cost amount" style="width:88px;flex:none;text-align:right;font-feature-settings:'tnum'">
        <button class="btn btn-ghost" sc-camel-on-click="{{ oc.remove }}" aria-label="Remove cost" style="min-height:38px;padding:0 8px;color:#b0563e;flex:none">×</button>
      </div>
    </sc-for>
    <button class="btn btn-secondary" sc-camel-on-click="{{ addEventOtherCost }}" style="min-height:38px;font-size:12px">+ Add cost</button>
  </div>
`;

// Costs sit at the end of the event screen, after the lineup and results,
// rather than interrupting the header.
// On the new sale screen the whole product row added a unit, so brushing a row
// while scrolling a price list put things in the order. Only the + adds now.
// The plus shown at zero was a decorative span with no handler, relying on that
// row click, so it becomes a real button at the same time.
function onlyPlusAddsToSale(template: string): string {
  const row =
    '<div sc-camel-on-click="{{ p.add }}" style="display:flex;align-items:center;gap:11px;padding:8px 0;border-top:1px solid var(--color-divider);cursor:pointer">';
  if (!template.includes(row)) throw new Error("Missing stable sale row anchor");
  let out = template.replace(
    row,
    () =>
      '<div style="display:flex;align-items:center;gap:11px;padding:8px 0;border-top:1px solid var(--color-divider)">',
  );

  const decorativePlus =
    '<span style="display:{{ p.addDisplay }};flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--color-accent-300);color:var(--color-accent);place-items:center;font-size:16px">+</span>';
  if (!out.includes(decorativePlus)) throw new Error("Missing stable sale add anchor");
  return out.replace(
    decorativePlus,
    () =>
      '<button sc-camel-on-click="{{ p.add }}" aria-label="Add one" style="display:{{ p.addDisplay }};flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--color-accent-300);background:#fff;color:var(--color-accent);place-items:center;font-size:16px;cursor:pointer;padding:0">+</button>',
  );
}

function moveEventCostsToBottom(template: string): string {
  const anchor = "  </sc-if>\n</div>\n</sc-if>\n\n<!-- ══ SHOPPING LIST ══ -->";
  if (!template.includes(anchor)) {
    throw new Error("Missing stable event screen end anchor");
  }
  return template.replace(
    anchor,
    () => "  </sc-if>\n" + eventCostEditorMarkup + "</div>\n</sc-if>\n\n<!-- ══ SHOPPING LIST ══ -->",
  );
}

function linkNoticedCards(template: string): string {
  const cards: Array<[string, string, string]> = [
    ["  <div class=\"card\" style=\"gap:8px\">\n    <span class=\"card-kicker\">Baketly noticed</span>\n    <div style=\"font-size:14px;line-height:1.55\">Sourdough is your best earner per oven-hour, and Base Market Saturdays drive most of it. Margins still exclude your time — <span style=\"color:var(--color-accent-700)\">set an hourly rate</span> to see true profit.</div>\n  </div>", "  <div class=\"card\" sc-camel-on-click=\"{{ askAboutInsight }}\" style=\"gap:8px;cursor:pointer\">\n    <span class=\"card-kicker\">Baketly noticed</span>\n    <div style=\"font-size:14px;line-height:1.55\">{{ insightText }}</div>\n    <div style=\"font-size:12px;font-weight:600;color:var(--color-accent-700)\">Ask about this ›</div>\n  </div>", "home noticed card"],
    ["  <div class=\"card\" style=\"margin-top:20px;gap:8px\">\n    <span class=\"card-kicker\">Baketly noticed</span>\n    <div style=\"font-size:14px;line-height:1.5\">Base Market Saturdays are your most profitable event — about $190 more kept per event than Montclair, mostly from sourdough sales.</div>\n  </div>", "  <div class=\"card\" sc-camel-on-click=\"{{ askAboutMarketsInsight }}\" style=\"margin-top:20px;gap:8px;cursor:pointer\">\n    <span class=\"card-kicker\">Baketly noticed</span>\n    <div style=\"font-size:14px;line-height:1.5\">{{ marketsInsightText }}</div>\n    <div style=\"font-size:12px;font-weight:600;color:var(--color-accent-700)\">Ask about this ›</div>\n  </div>", "markets noticed card"],
  ];
  for (const [from, to, label] of cards) {
    if (!template.includes(from)) throw new Error(`Missing stable ${label} anchor`);
    template = template.replace(from, () => to);
  }
  return template;
}

function addCommerceBehavior(template: string): string {
  let out = template.replace(
    "evSold: {}, evStatus: 'planned', evSaved: false, actualRev: 0, soldRev: 0,",
    () => { return "evSold: {}, evStatus: 'planned', evSaved: false, actualRev: 0, soldRev: 0, saleRecords: [], eventRecords: [], analyticsTab: 'overview', analyticsMonth: '', eventCurrentId: 'event-base-farmers-market-2026-09-12', eventName: 'Base Farmers Market', eventDate: '2026-09-12', eventBoothFee: 125,"; },
  );
  out = out.replace(
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px"><h2 style="font-size:28px;margin:0">Markets &amp; orders</h2><button class="btn btn-primary" sc-camel-on-click="{{ goEventNew }}" style="min-height:44px">+ New event</button></div>',
    () => '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px"><h2 style="font-size:28px;margin:0;flex:1;min-width:0">Markets &amp; orders</h2><button class="btn btn-primary" sc-camel-on-click="{{ goEventNew }}" style="min-height:44px;padding:8px 10px;white-space:nowrap;flex:none">+ New event</button></div>',
  );
  out = out.replace(
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="font-size:28px;margin:0">Base Farmers Market</h2><span class="tag tag-accent">{{ evStatusLabel }}</span></div>\n  <p class="text-muted" style="font-size:13px;margin:4px 0 18px">Production date Sep 12 · booth $125</p>',
    () => '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"><input class="input" value="{{ eventName }}" sc-camel-on-change="{{ setEventName }}" aria-label="Event name" style="flex:1;min-width:180px;font-family:var(--font-heading);font-weight:600;font-size:24px;padding:7px 10px"></div>\n  <div style="display:grid;grid-template-columns:1fr 100px;gap:10px;margin:10px 0 18px"><div class="field"><label>Event date</label><input class="input" type="date" value="{{ eventDate }}" sc-camel-on-change="{{ setEventDate }}" aria-label="Event date"></div><div class="field"><label>Booth fee</label><input class="input" inputmode="decimal" value="{{ eventBoothFee }}" sc-camel-on-change="{{ setEventBoothFee }}" aria-label="Booth fee"></div></div>',
  );
  out = out.replace(
    "        const { evQty, evSold, shopChecked, cashQty, cashPaid, cashOrdersArr } = this.state;",
    () => `        const { evQty, evSold, shopChecked, cashQty, cashPaid, cashOrdersArr } = this.state;
        const recipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const recipeCost = r => ((r.ingredientKeys || []).reduce((sum, key) => sum + (Number((r.amounts || {})[key]) || 0) * (this.ING_META[key] ? this.ING_META[key].per : 0), 0) / Math.max(1, Number(r.yield) || 1)) + (r.packagingKeys || []).reduce((sum, key) => sum + (this.PACK_META[key] ? this.PACK_META[key].per : 0), 0);
        const productFor = p => recipes.find(r => r.id === p.k || r.name === p.name);
        const eventProduct = p => { const r = productFor(p); return r ? { id: p.k, productId: r.id, name: r.name, price: Number(r.price) || 0, cost: recipeCost(r) } : { id: p.k, productId: p.k, name: p.name, price: Number(p.price) || 0, cost: Number(p.cost) || 0 }; };
        const eventProducts = this.EV_META.map(eventProduct);
        const eventId = this.state.eventCurrentId || 'event-base-farmers-market-2026-09-12';`,
  );
  out = out.replace(
    /        const rev = this\.EV_META\.reduce\([\s\S]*?        const evLineup = this\.EV_META\.map\(p => \(\{/,
    () => `        const rev = eventProducts.reduce((s, p) => s + (evQty[p.id] || 0) * p.price, 0);
        const cst = eventProducts.reduce((s, p) => s + (evQty[p.id] || 0) * p.cost, 0);
        const units = eventProducts.reduce((s, p) => s + (evQty[p.id] || 0), 0);
        const numIn = (obj, key) => e => { const v = parseInt(e.target.value, 10); this.setState(st => ({ [obj]: { ...st[obj], [key]: isNaN(v) || v < 0 ? 0 : v } })); };
        const evLineup = eventProducts.map(p => ({`,
  );
  out = out.replaceAll("evQty[p.k]", "evQty[p.id]").replaceAll("evSold[p.k]", "evSold[p.id]").replaceAll("cashQty[p.k]", "cashQty[p.id]");
  out = out.replace(
    "const cashProducts = this.EV_META.slice(0, 4).map(p => ({",
    () => "const cashProducts = eventProducts.slice(0, 4).map(p => ({",
  ).replace(
    "const orderTotal = this.EV_META.reduce((s, p) => s + (cashQty[p.k] || 0) * p.price, 0);",
    () => "const orderTotal = eventProducts.reduce((s, p) => s + (cashQty[p.id] || 0) * p.price, 0);",
  ).replace(
    "const soldRevenue = this.EV_META.reduce((s, p) => s + (evSold[p.k] || 0) * p.price, 0);",
    () => "const soldRevenue = eventProducts.reduce((s, p) => s + (evSold[p.id] || 0) * p.price, 0);",
  );
  out = out.replace(
    "          updateRevenue: () => this.setState({ evSaved: true, soldRev: soldRevenue, actualRev: soldRevenue + collected }),",
    () => `          eventName: this.state.eventName || 'Base Farmers Market', eventDate: this.state.eventDate || '2026-09-12', eventBoothFee: String(this.state.eventBoothFee ?? 125),
           eventOtherCosts: draftOtherCosts.map((cost, index) => ({
             label: String((cost && cost.label) ?? ''),
             amount: String((cost && cost.amount) ?? ''),
             setLabel: e => this.setState(st => { const next = [...(st.eventOtherCosts || [])]; next[index] = { ...next[index], label: e.target.value.slice(0, 60) }; return { eventOtherCosts: next }; }),
             setAmount: e => this.setState(st => { const next = [...(st.eventOtherCosts || [])]; next[index] = { ...next[index], amount: e.target.value }; return { eventOtherCosts: next }; }),
             remove: () => this.setState(st => ({ eventOtherCosts: (st.eventOtherCosts || []).filter((_, i) => i !== index) }))
           })),
           hasEventOtherCosts: draftOtherCosts.length > 0,
           evCardMonth: (() => { const d = new Date(this.state.eventDate || Date.now()); return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short' }); })(),
           evCardDay: (() => { const d = new Date(this.state.eventDate || Date.now()); return isNaN(d.getTime()) ? '' : String(d.getDate()); })(),
           evCardSub: (() => {
             const planned = Object.keys(this.state.evQty || {}).filter(key => (Number((this.state.evQty || {})[key]) || 0) > 0).length;
             const booth = Number(this.state.eventBoothFee) || 0;
             return planned + (planned === 1 ? ' product' : ' products') + ' · booth ' + (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$') + booth.toFixed(2);
           })(),
           eventOtherCostTotalStr: (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$') + draftOtherCostTotal.toFixed(2),
           addEventOtherCost: () => this.setState(st => ({ eventOtherCosts: [...(Array.isArray(st.eventOtherCosts) ? st.eventOtherCosts : []), { label: '', amount: '' }].slice(0, 20) })),
           setEventName: e => this.setState({ eventName: e.target.value.slice(0, 160) }), setEventDate: e => this.setState({ eventDate: e.target.value }), setEventBoothFee: e => this.setState({ eventBoothFee: Math.max(0, Number(e.target.value) || 0) }),
           startNewEvent: () => this.setState(st => ({ eventOtherCosts: [], eventCurrentId: 'event-' + Date.now().toString(36), eventName: 'New market', eventDate: new Date().toISOString().slice(0, 10), eventBoothFee: 0, evQty: {}, evSold: {}, evStatus: 'planned', evSaved: false, actualRev: 0, soldRev: 0, cashQty: {}, cashPaid: '', cashOrdersArr: [], screen: 'event', stack: st.stack })),
          updateRevenue: () => this.setState(st => {
            const occurredAt = (st.eventDate || '2026-09-12') + 'T12:00:00.000Z';
            const previous = (st.saleRecords || []).find(s => s.id === 'sale-' + eventId + '-direct');
            const oldLines = new Map((previous && previous.lineItems || []).map(line => [line.productId, line]));
            const lines = eventProducts.filter(p => (st.evSold || {})[p.id] > 0).map(p => {
              const quantity = (st.evSold || {})[p.id];
              const prior = oldLines.get(p.productId);
              if (!prior || quantity <= prior.quantity) return { productId: p.productId, name: p.name, quantity, unitPrice: prior ? prior.unitPrice : p.price, unitCost: prior ? prior.unitCost : p.cost };
              const added = quantity - prior.quantity;
              return { productId: p.productId, name: p.name, quantity, unitPrice: (prior.unitPrice * prior.quantity + p.price * added) / quantity, unitCost: (prior.unitCost * prior.quantity + p.cost * added) / quantity };
            });
            const direct = { id: 'sale-' + eventId + '-direct', occurredAt, source: 'event', eventId, total: lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0), lineItems: lines };
            const otherCosts = (Array.isArray(st.eventOtherCosts) ? st.eventOtherCosts : [])
              .map(cost => ({ label: String((cost && cost.label) || '').trim().slice(0, 60) || 'Other cost', amount: Math.max(0, Number(cost && cost.amount) || 0) }))
              .filter(cost => cost.amount > 0);
            // what was baked for this market, so sell-through can be shown later
            const plannedItems = eventProducts
              .map(p => ({ productId: p.productId, name: p.name, quantity: Math.max(0, Math.round(Number((st.evQty || {})[p.id]) || 0)) }))
              .filter(item => item.quantity > 0);
            const event = { id: eventId, name: st.eventName || 'Base Farmers Market', occurredAt, boothFee: Math.max(0, Number(st.eventBoothFee) || 0), ...(otherCosts.length ? { otherCosts } : {}), ...(plannedItems.length ? { plannedItems } : {}), lineItems: lines };
            const salesWithoutDirect = (st.saleRecords || []).filter(s => s.id !== direct.id);
            const sales = lines.length > 0 ? [...salesWithoutDirect, direct] : salesWithoutDirect;
            const actual = sales.filter(s => s.eventId === eventId).reduce((sum, s) => sum + (Number(s.total) || 0), 0);
            return { eventRecords: [...(st.eventRecords || []).filter(e => e.id !== eventId), event], saleRecords: sales, evSaved: true, soldRev: direct.total, actualRev: actual };
          }),`,
  );
  out = out.replace(
    "            this.setState(st => ({ cashOrdersArr: [{ summary, time, total: orderTotal }, ...st.cashOrdersArr], cashQty: {}, cashPaid: '' }));",
    () => `            this.setState(st => { const saleId = 'sale-cash-' + Date.now().toString(36); const lines = eventProducts.filter(p => (st.cashQty || {})[p.id] > 0).map(p => ({ productId: p.productId, name: p.name, quantity: (st.cashQty || {})[p.id], unitPrice: p.price, unitCost: p.cost })); const sale = { id: saleId, occurredAt: (st.eventDate || '2026-09-12') + 'T12:00:00.000Z', source: 'cash', eventId, total: orderTotal, lineItems: lines }; return { cashOrdersArr: [{ summary, time, total: orderTotal, saleId }, ...(st.cashOrdersArr || [])], saleRecords: [...(st.saleRecords || []), sale], cashQty: {}, cashPaid: '' }; });`,
  ).replace(
    "remove: () => this.setState(st => ({ cashOrdersArr: st.cashOrdersArr.filter((_, j) => j !== i) }))",
    () => "remove: () => this.setState(st => ({ cashOrdersArr: (st.cashOrdersArr || []).filter((_, j) => j !== i), saleRecords: o.saleId ? (st.saleRecords || []).filter(s => s.id !== o.saleId) : (st.saleRecords || []) }))",
  );
  out = out.replace(
    "const summary = this.EV_META.filter(p => cashQty[p.id]).map(p => cashQty[p.id] + '× ' + p.name.replace('Sourdough ', '').replace('Mini ', '').replace('Big ', '')).join(', ');",
    () => "const summary = eventProducts.filter(p => cashQty[p.id]).map(p => cashQty[p.id] + '× ' + p.name.replace('Sourdough ', '').replace('Mini ', '').replace('Big ', '')).join(', ');",
  );
  out = out
    .replaceAll("numIn('evQty', p.k)", "numIn('evQty', p.id)")
    .replaceAll("numIn('evSold', p.k)", "numIn('evSold', p.id)")
    .replaceAll("[p.k]: (st.cashQty[p.id] || 0)", "[p.id]: (st.cashQty[p.id] || 0)")
    .replaceAll("[p.k]: Math.max(0, (st.cashQty[p.id] || 0) - 1)", "[p.id]: Math.max(0, (st.cashQty[p.id] || 0) - 1)")
    .replace(
      "const orderTotal = this.EV_META.reduce((s, p) => s + (cashQty[p.id] || 0) * p.price, 0);",
      () => "const orderTotal = eventProducts.reduce((s, p) => s + (cashQty[p.id] || 0) * p.price, 0);",
    )
    .replace(
      "const soldRevenue = this.EV_META.reduce((s, p) => s + (evSold[p.id] || 0) * p.price, 0);",
      () => "const soldRevenue = eventProducts.reduce((s, p) => s + (evSold[p.id] || 0) * p.price, 0);",
    );
  out = out.replace(
    "        const soldRevenue = eventProducts.reduce((s, p) => s + (evSold[p.id] || 0) * p.price, 0);\n        return {",
    () => `        const soldRevenue = eventProducts.reduce((s, p) => s + (evSold[p.id] || 0) * p.price, 0);
        const eventProductionCost = (this.state.saleRecords || []).filter(s => s.eventId === eventId).reduce((sum, sale) => sum + (sale.lineItems || []).reduce((lineSum, line) => lineSum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0), 0);
        const draftOtherCosts = Array.isArray(this.state.eventOtherCosts) ? this.state.eventOtherCosts : [];
        const draftOtherCostTotal = draftOtherCosts.reduce((sum, cost) => sum + (Number(cost && cost.amount) || 0), 0);
        const actualEventProfit = (Number(this.state.actualRev) || 0) - eventProductionCost - (Number(this.state.eventBoothFee) || 0) - draftOtherCostTotal;
        return {`,
  ).replace(
    "actualProfitStr: $(this.state.actualRev - cst),",
    () => "actualProfitStr: $(actualEventProfit),",
  );
  out = out.replace(
    "const { posQty, posMethod, posTendered, posStage, posDone, posContact, posSent, todayArr } = this.state;\n            const total = this.RECIPES.reduce((s, r) => s + (posQty[r.name] || 0) * r.sell, 0);",
    () => "const { posQty, posMethod, posTendered, posStage, posDone, posContact, posSent, todayArr } = this.state;\n            const posRecipes = recipes.map(r => ({ ...r, sell: Number(r.price) || 0, cost: recipeCost(r) }));\n            const total = posRecipes.reduce((s, r) => s + (posQty[r.id] || 0) * r.sell, 0);",
  ).replaceAll("this.RECIPES.reduce((s, r) => s + (posQty[r.name] || 0)", "posRecipes.reduce((s, r) => s + (posQty[r.id] || 0)").replace(
    "const visible = this.RECIPES.filter",
    () => "const visible = posRecipes.filter",
  ).replace(
    "const k = r.name, n = posQty[k] || 0;",
    () => "const k = r.id, n = posQty[k] || 0;",
  ).replace(
    "todayArr: [...st.todayArr, final],",
    () => "todayArr: [...st.todayArr, final], saleRecords: [...(st.saleRecords || []), { id: 'sale-pos-' + Date.now().toString(36), occurredAt: new Date().toISOString(), source: 'pos', total: final, lineItems: posRecipes.filter(r => (st.posQty || {})[r.id] > 0).map(r => ({ productId: r.id, name: r.name, quantity: (st.posQty || {})[r.id], unitPrice: ((Number(r.sell) || 0) * (total > 0 ? final / total : 1)), unitCost: r.cost })) }],",
  );
  return onlyPlusAddsToSale(
    moveEventCostsToBottom(linkNoticedCards(replacePastEvents(removeCashTracker(out)))),
  );
}

// The Upcoming row on Markets was fixed text: a Sep 12 date, "Base Farmers
// Market", and "Saturday Market Prep · 5 products · booth $125". Only the
// estimate beside it was ever bound, so the row described a market nobody had
// planned and its booth fee stayed in dollars whatever the currency was set to.
function bindUpcomingRow(template: string): string {
  const anchor =
    "<div style=\"text-align:center;flex:none;width:44px\"><div style=\"font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-accent)\">Sep</div><div style=\"font-family:var(--font-heading);font-weight:600;font-size:22px;line-height:1;font-feature-settings:'tnum'\">12</div></div>\n    <div style=\"flex:1\"><div style=\"font-family:var(--font-heading);font-weight:600;font-size:17px\">Base Farmers Market</div><div class=\"text-muted\" style=\"font-size:12px\">Saturday Market Prep · 5 products · booth $125</div></div>";
  if (!template.includes(anchor)) throw new Error("Missing Markets upcoming row anchor");
  return template.replace(
    anchor,
    () =>
      "<div style=\"text-align:center;flex:none;width:44px\"><div style=\"font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-accent)\">{{ evCardMonth }}</div><div style=\"font-family:var(--font-heading);font-weight:600;font-size:22px;line-height:1;font-feature-settings:'tnum'\">{{ evCardDay }}</div></div>\n    <div style=\"flex:1\"><div style=\"font-family:var(--font-heading);font-weight:600;font-size:17px\">{{ eventName }}</div><div class=\"text-muted\" style=\"font-size:12px\">{{ evCardSub }}</div></div>",
  );
}
