// The home screen, computed from the baker's own records.
//
// Every module here shipped as static mockup copy: an invented $2,810 month,
// an invented butter rise, a pricing-health score of 74 and four sample
// products. The plumbing was real — modules can be reordered and hidden — but
// no value was ever read from state, so a brand new account opened onto
// somebody else's bakery.
//
// Money and margins use the same basis as Analytics (revenue is the sum of
// sale totals, cost is quantity x unit cost) so the two screens never disagree.

// Used only until the baker sets their own target during setup.
const DEFAULT_TARGET_MARGIN = 0.7;

const homeData = `    const home = (() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
      const money2 = value => (value < 0 ? ('-' + CUR) : CUR) + Math.abs(value).toFixed(2);
      const money0 = value => (value < 0 ? ('-' + CUR) : CUR) + Math.abs(Math.round(value)).toLocaleString('en-US');
      const st = this.state;
      const recipes = Array.isArray(st.recipeRecords) ? st.recipeRecords : [];
      const sales = Array.isArray(st.saleRecords) ? st.saleRecords : [];
      const events = Array.isArray(st.eventRecords) ? st.eventRecords : [];
      const history = st.priceHistory || {};
      const removed = new Set(st.removedIngredientKeys || []);
      // the target the baker set during setup, not a number Baketly picked
      const WELL = Math.min(0.95, Math.max(0.05, (Number(st.targetMargin) || ${DEFAULT_TARGET_MARGIN} * 100) / 100));

      // ---- what one unit of a recipe costs to make -------------------------
      const unitCostWith = (recipe, costOf) => {
        const made = Math.max(1, Number(recipe.yield) || 1);
        const ingredients = (recipe.ingredientKeys || []).reduce(
          (sum, key) => sum + (Number((recipe.amounts || {})[key]) || 0) * costOf(key), 0);
        const packaging = (recipe.packagingKeys || []).reduce(
          (sum, key) => sum + ((this.PACK_META[key] && Number(this.PACK_META[key].per)) || 0), 0);
        return ingredients / made + packaging;
      };
      const costNow = key => (this.ING_META[key] && Number(this.ING_META[key].per)) || 0;
      const costWas = key => {
        const entries = history[key] || [];
        const last = entries[entries.length - 1];
        const before = last ? Number(last.unitCost) || 0 : 0;
        return before > 0 ? before : costNow(key);
      };
      const unitCost = recipe => unitCostWith(recipe, costNow);

      const openRecipe = recipe => () => this.setState(s => ({
        screen: 'recipeEditor', stack: [...s.stack, s.screen], activeRecipeId: recipe.id,
        recipeDraft: null, recipeDeleteOpen: false, ingPickerOpen: false, packPickerOpen: false
      }));
      const openEvent = event => () => this.setState(s => ({
        screen: 'analyticsEvent', stack: [...s.stack, s.screen], analyticsEventId: event.id, eventCostsOpen: false
      }));

      // ---- month totals, on the same basis Analytics uses ------------------
      const now = new Date();
      const monthKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      const thisMonth = monthKey(now);
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = monthKey(prevDate);
      const otherCostsOf = event => (Array.isArray(event && event.otherCosts) ? event.otherCosts : [])
        .reduce((sum, cost) => sum + (Number(cost && cost.amount) || 0), 0);
      const byMonth = {};
      sales.forEach(sale => {
        if (!sale.occurredAt) return;
        const when = new Date(sale.occurredAt);
        if (isNaN(when.getTime())) return;
        const key = monthKey(when);
        if (!byMonth[key]) byMonth[key] = { revenue: 0, cost: 0, items: 0 };
        byMonth[key].revenue += Number(sale.total) || 0;
        (sale.lineItems || []).forEach(line => {
          const quantity = Number(line.quantity) || 0;
          byMonth[key].cost += quantity * (Number(line.unitCost) || 0);
          byMonth[key].items += quantity;
        });
      });
      const current = byMonth[thisMonth] || { revenue: 0, cost: 0, items: 0 };
      const feesIn = month => events
        .filter(event => (event.occurredAt || '').slice(0, 7) === month)
        .reduce((sum, event) => sum + (Number(event.boothFee) || 0) + otherCostsOf(event), 0);
      const currentKept = current.revenue - current.cost - feesIn(thisMonth);
      const previous = byMonth[prevMonth] || null;
      const monthName = date => date.toLocaleString('en-US', { month: 'long' });
      const changeVsPrev = previous && previous.revenue > 0
        ? Math.round(((current.revenue - previous.revenue) / previous.revenue) * 100)
        : null;

      const dateLabel = 'Baketly · ' + now.toLocaleString('en-US', { month: 'short', day: 'numeric' });
      let monthLine;
      if (!sales.length) monthLine = 'No sales recorded yet';
      else {
        monthLine = monthName(now) + ' so far: ' + money0(current.revenue);
        if (changeVsPrev !== null) {
          monthLine += ' · ' + (changeVsPrev >= 0 ? '↑' : '↓') + Math.abs(changeVsPrev) + '% vs ' + monthName(prevDate);
        }
      }

      // ---- pricing -----------------------------------------------------------
      const priced = recipes.filter(recipe => (Number(recipe.price) || 0) > 0).map(recipe => {
        const price = Number(recipe.price) || 0;
        const cost = unitCost(recipe);
        const profit = price - cost;
        return {
          name: recipe.name || 'Untitled recipe', price, cost, profit,
          margin: price > 0 ? profit / price : 0,
          open: openRecipe(recipe)
        };
      });
      const unpricedRecipes = recipes.filter(recipe => !((Number(recipe.price) || 0) > 0));
      const wellPriced = priced.filter(item => item.margin >= WELL);
      const thin = priced.filter(item => item.margin < WELL).sort((a, b) => a.margin - b.margin);
      const healthScore = priced.length ? Math.round((wellPriced.length / priced.length) * 100) : 0;
      // the ring is r=39, so its circumference is a little over 245
      const healthDash = Math.round((245 * healthScore) / 100) + ' 245';

      const byProfit = priced.slice().sort((a, b) => b.profit - a.profit);
      const pickRows = byProfit.length <= 4
        ? byProfit
        : [byProfit[0], byProfit[1], byProfit[byProfit.length - 2], byProfit[byProfit.length - 1]];
      const bestWorstRows = pickRows.map(item => ({
        name: item.name,
        priceStr: money2(item.price),
        profitStr: money2(item.profit) + ' profit',
        color: item.margin >= WELL ? '#7d8a3c' : 'var(--color-accent-700)',
        open: item.open
      }));

      // ---- markets -----------------------------------------------------------
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const eventTime = event => {
        const when = new Date(event.occurredAt || 0);
        return isNaN(when.getTime()) ? NaN : when.getTime();
      };
      const dated = events.filter(event => !isNaN(eventTime(event)));
      const upcoming = dated.filter(event => eventTime(event) >= startOfToday)
        .sort((a, b) => eventTime(a) - eventTime(b));
      const past = dated.filter(event => eventTime(event) < startOfToday)
        .sort((a, b) => eventTime(b) - eventTime(a));
      const nextEvent = upcoming[0] || null;
      const lastEvent = past[0] || null;

      const recipeById = {};
      recipes.forEach(recipe => { if (recipe.id) recipeById[recipe.id] = recipe; });

      let nextMonthLabel = '', nextDayLabel = '', nextName = '', nextSub = '';
      if (nextEvent) {
        const when = new Date(nextEvent.occurredAt);
        nextMonthLabel = when.toLocaleString('en-US', { month: 'short' });
        nextDayLabel = String(when.getDate());
        nextName = nextEvent.name || 'Market';
        const plannedItems = Array.isArray(nextEvent.plannedItems) ? nextEvent.plannedItems : [];
        if (plannedItems.length) {
          let goal = 0, production = 0;
          plannedItems.forEach(item => {
            const quantity = Math.max(0, Number(item.quantity) || 0);
            const recipe = recipeById[item.productId];
            goal += quantity * (recipe ? Number(recipe.price) || 0 : 0);
            production += quantity * (recipe ? unitCost(recipe) : 0);
          });
          const breakEven = (Number(nextEvent.boothFee) || 0) + otherCostsOf(nextEvent) + production;
          nextSub = 'break-even ' + money0(breakEven) + ' · goal ' + money0(goal);
        } else {
          nextSub = 'nothing planned yet';
        }
      }

      let lastTitle = '', lastRevenue = '', lastCosts = '', lastKept = '';
      if (lastEvent) {
        const when = new Date(lastEvent.occurredAt);
        lastTitle = 'Last market · ' + (lastEvent.name || 'Market') + ', '
          + when.toLocaleString('en-US', { month: 'short', day: 'numeric' });
        let revenue = 0, production = 0;
        sales.filter(sale => sale.eventId === lastEvent.id).forEach(sale => {
          revenue += Number(sale.total) || 0;
          (sale.lineItems || []).forEach(line => {
            production += (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
          });
        });
        const costs = production + (Number(lastEvent.boothFee) || 0) + otherCostsOf(lastEvent);
        lastRevenue = money0(revenue);
        lastCosts = '−' + money0(costs);
        lastKept = money0(revenue - costs);
      }

      // ---- what ingredient prices have done -----------------------------------
      const movers = [];
      Object.keys(history).forEach(key => {
        if (removed.has(key)) return;
        const meta = this.ING_META[key];
        if (!meta) return;
        const before = costWas(key);
        const after = costNow(key);
        if (!(before > 0)) return;
        const pct = Math.round(((after - before) / before) * 100);
        if (pct === 0) return;
        movers.push({ key, name: meta.name || key, pct });
      });
      movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

      const shifted = recipes.map(recipe => ({
        name: recipe.name || 'Untitled recipe',
        delta: unitCostWith(recipe, costNow) - unitCostWith(recipe, costWas)
      })).filter(row => Math.abs(row.delta) >= 0.005)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      let readHeadline = 'Nothing has moved yet.';
      let readBody = 'Baketly watches your ingredient prices and works out what each change does to every recipe that uses them. Update a package price and the first read appears here.';
      let costWatchText = '';
      if (movers.length) {
        const top = movers[0];
        const touching = recipes.filter(recipe => (recipe.ingredientKeys || []).includes(top.key)).length;
        const direction = top.pct > 0 ? 'up ' : 'down ';
        readHeadline = touching > 0
          ? top.name + ' is ' + direction + Math.abs(top.pct) + '%, and it touches ' + touching
            + ' of your ' + recipes.length + ' recipe' + (recipes.length === 1 ? '' : 's') + '.'
          : top.name + ' is ' + direction + Math.abs(top.pct) + '%, but none of your recipes use it yet.';
        if (shifted.length) {
          readBody = shifted[0].name + ' moved the most: ' + money2(Math.abs(shifted[0].delta))
            + (shifted[0].delta > 0 ? ' more' : ' less') + ' per unit. '
            + (thin.length
              ? thin.length + ' of your recipes now sit under a ' + Math.round(WELL * 100) + '% margin.'
              : 'Every priced recipe still holds its margin.');
        } else {
          readBody = 'No recipe has changed by more than a cent, so nothing needs repricing yet.';
        }
        costWatchText = movers.slice(0, 4)
          .map(mover => mover.name + ' ' + (mover.pct > 0 ? '↑' : '↓') + Math.abs(mover.pct) + '%')
          .join(' · ') + '.'
          + (shifted.length
            ? ' ' + shifted[0].name + ' is ' + (shifted[0].delta > 0 ? 'up ' : 'down ')
              + money2(Math.abs(shifted[0].delta)) + ' a unit.'
            : '');
      }

      // ---- what actually needs the baker's attention ---------------------------
      const attention = [];
      unpricedRecipes.slice(0, 2).forEach(recipe => attention.push({
        kicker: 'Needs a price',
        text: (recipe.name || 'This recipe') + ' has no selling price yet, so Baketly cannot show what it earns.',
        cta: 'Set a price →',
        go: openRecipe(recipe)
      }));
      thin.slice(0, 2).forEach(item => attention.push({
        kicker: 'Review price',
        text: item.name + ' keeps ' + money2(item.profit) + ' of ' + money2(item.price)
          + ' — a ' + Math.round(item.margin * 100) + '% margin, below the ' + Math.round(WELL * 100) + '% the rest of your pricing assumes.',
        cta: 'Open the recipe →',
        go: item.open
      }));
      const savedIngredients = st.ingredientRecords || {};
      Object.keys(savedIngredients)
        .filter(key => !removed.has(key) && !((Number((savedIngredients[key] || {}).packagePrice) || 0) > 0))
        .slice(0, 2)
        .forEach(key => attention.push({
          kicker: 'Missing cost',
          text: ((this.ING_META[key] && this.ING_META[key].name) || key)
            + ' has no package price, so every recipe using it is costed short.',
          cta: 'Add the price →',
          go: () => this.setState(s => ({
            screen: 'ingredientEdit', stack: [...s.stack, s.screen],
            activeIngredientKey: key, ingredientDraft: null, ingredientSaveError: ''
          }))
        }));
      const attentionItems = attention.slice(0, 3);

      return {
        show: {
          read: movers.length > 0 || Object.keys(st.ingredientRecords || {}).length > 0,
          health: priced.length > 0,
          bestworst: priced.length >= 2,
          nextmarket: !!nextEvent,
          snapshot: current.revenue > 0,
          attention: attentionItems.length > 0,
          lastmarket: !!lastEvent,
          costwatch: movers.length > 0,
          // there is no orders model in the app yet, so this can only be invented
          orders: false,
          chatmod: true
        },
        vals: {
          homeDateLabel: dateLabel,
          homeMonthLine: monthLine,
          readHeadline: readHeadline,
          readBody: readBody,
          healthScore: healthScore,
          healthDash: healthDash,
          healthAnalyzed: priced.length + (priced.length === 1 ? ' recipe priced' : ' recipes priced'),
          healthWell: wellPriced.length + ' priced well',
          healthThin: thin.length + ' underpriced',
          healthHasThin: thin.length > 0,
          healthUnpriced: unpricedRecipes.length + ' without a price',
          healthHasUnpriced: unpricedRecipes.length > 0,
          healthReviewLabel: 'Review the ' + thin.length + ' →',
          bestWorstRows: bestWorstRows,
          nextMarketMonth: nextMonthLabel,
          nextMarketDay: nextDayLabel,
          nextMarketName: nextName,
          nextMarketSub: nextSub,
          openNextMarket: nextEvent ? openEvent(nextEvent) : () => {},
          snapRevenue: money0(current.revenue),
          snapRevenueSub: changeVsPrev === null
            ? 'first month with sales'
            : (changeVsPrev >= 0 ? '↑ ' : '↓ ') + Math.abs(changeVsPrev) + '% vs ' + monthName(prevDate),
          snapProfit: money0(currentKept),
          snapMargin: (current.revenue > 0 ? Math.round((currentKept / current.revenue) * 100) : 0) + '%',
          attentionCount: attentionItems.length,
          attentionItems: attentionItems,
          lastMarketTitle: lastTitle,
          lastMarketRevenue: lastRevenue,
          lastMarketCosts: lastCosts,
          lastMarketKept: lastKept,
          costWatchText: costWatchText
        }
      };
    })();
`;

/** Inserts the computation just before the module list is built. */
function insertHomeData(template: string): string {
  const anchor = "    const ids = editMode ? order : order.filter(id => !hidden[id]);";
  if (!template.includes(anchor)) throw new Error("Missing home module id anchor");
  return template.replace(
    anchor,
    () =>
      homeData +
      // A module with nothing to say is dropped rather than shown empty. This
      // also applies while arranging, so the mockup's sample content can never
      // reappear there.
      "    const ids = (editMode ? order : order.filter(id => !hidden[id])).filter(id => home.show[id] !== false);",
  );
}

/** Makes the computed values available to the page's bindings. */
function bindHomeValues(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable home binding anchor");
  return template.replace(
    anchor,
    (_match, indent: string) =>
      `${indent}...home.vals,\n${indent}onAnalytics: screen === 'analytics',`,
  );
}

/**
 * Swaps the body of one dashboard module. Each module is a single `sc-if` on
 * its own flag, so its block is found by matching that tag's own close.
 */
function replaceModule(template: string, flag: string, markup: string): string {
  const open = `<sc-if value="{{ m.${flag} }}"`;
  const start = template.indexOf(open);
  if (start === -1) throw new Error(`Missing home module ${flag}`);
  const innerStart = template.indexOf(">", start) + 1;
  let depth = 1;
  let cursor = innerStart;
  while (depth > 0) {
    const nextOpen = template.indexOf("<sc-if", cursor);
    const nextClose = template.indexOf("</sc-if>", cursor);
    if (nextClose === -1) throw new Error(`Unclosed home module ${flag}`);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 6;
    } else {
      depth -= 1;
      if (depth === 0) {
        return template.slice(0, innerStart) + markup + template.slice(nextClose);
      }
      cursor = nextClose + 8;
    }
  }
  throw new Error(`Unclosed home module ${flag}`);
}

const readModule = `
        <div style="border-top:2px solid var(--color-text);padding-top:14px">
          <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-accent);margin-bottom:8px">This week's read</div>
          <div style="font-family:var(--font-heading);font-weight:600;font-size:24px;line-height:1.25;margin-bottom:10px">{{ readHeadline }}</div>
          <p style="font-size:14px;line-height:1.6;margin-bottom:10px">{{ readBody }}</p>
          <button class="btn btn-primary" sc-camel-on-click="{{ goAlerts }}" style="min-height:44px">See what changed</button>
        </div>
      `;

const healthModule = `
        <div style="display:flex;gap:16px;border-top:1px solid var(--color-divider);border-bottom:1px solid var(--color-divider);padding:16px 0">
          <div style="flex:none;width:88px;height:88px;position:relative">
            <svg width="88" height="88" sc-camel-view-box="0 0 88 88"><circle cx="44" cy="44" r="39" fill="none" stroke="var(--color-neutral-200)" stroke-width="3"></circle><circle cx="44" cy="44" r="39" fill="none" stroke="var(--color-accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="{{ healthDash }}" transform="rotate(-90 44 44)"></circle></svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><span style="font-family:var(--font-heading);font-weight:600;font-size:26px;font-feature-settings:'tnum'">{{ healthScore }}</span><span class="text-muted" style="font-size:9px;letter-spacing:0.08em;text-transform:uppercase">of 100</span></div>
          </div>
          <div style="flex:1">
            <h6 style="margin-bottom:6px">Pricing health</h6>
            <div style="font-size:13px;line-height:1.6">{{ healthAnalyzed }}<br>{{ healthWell }}<sc-if value="{{ healthHasThin }}" hint-placeholder-val="{{ false }}"> · <span style="color:var(--color-accent-700)">{{ healthThin }}</span></sc-if><sc-if value="{{ healthHasUnpriced }}" hint-placeholder-val="{{ false }}"> · {{ healthUnpriced }}</sc-if></div>
            <sc-if value="{{ healthHasThin }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ goRecipes }}" style="margin-left:-5px;min-height:40px">{{ healthReviewLabel }}</button></sc-if>
          </div>
        </div>
      `;

const bestWorstModule = `
        <h6 style="margin-bottom:8px">Best and worst per unit</h6>
        <sc-raw-table class="table" style="font-size:13px">
          <sc-raw-tbody>
            <sc-for list="{{ bestWorstRows }}" as="row" hint-placeholder-count="2">
              <sc-raw-tr class="bk-row" sc-camel-on-click="{{ row.open }}" style="cursor:pointer"><sc-raw-td>{{ row.name }}</sc-raw-td><sc-raw-td style="text-align:right;font-feature-settings:'tnum'">{{ row.priceStr }}</sc-raw-td><sc-raw-td style="text-align:right;font-feature-settings:'tnum';color:{{ row.color }}">{{ row.profitStr }}</sc-raw-td></sc-raw-tr>
            </sc-for>
          </sc-raw-tbody>
        </sc-raw-table>
      `;

const nextMarketModule = `
        <div class="bk-row" sc-camel-on-click="{{ openNextMarket }}" style="display:flex;align-items:center;gap:14px;padding:14px 0;border-top:1px solid var(--color-divider);border-bottom:1px solid var(--color-divider);cursor:pointer">
          <div style="text-align:center;flex:none;width:44px"><div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-accent)">{{ nextMarketMonth }}</div><div style="font-family:var(--font-heading);font-weight:600;font-size:22px;line-height:1;font-feature-settings:'tnum'">{{ nextMarketDay }}</div></div>
          <div style="flex:1"><div style="font-family:var(--font-heading);font-weight:600;font-size:17px">{{ nextMarketName }}</div><div class="text-muted" style="font-size:12px">{{ nextMarketSub }}</div></div>
          <span class="text-muted" style="font-size:18px">›</span>
        </div>
      `;

const snapshotModule = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid var(--color-divider);border-bottom:1px solid var(--color-divider);padding:14px 0">
          <div style="padding-right:12px"><div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Revenue</div><div style="font-family:var(--font-heading);font-weight:600;font-size:23px;font-feature-settings:'tnum'">{{ snapRevenue }}</div><div class="text-muted" style="font-size:11px">{{ snapRevenueSub }}</div></div>
          <div style="padding:0 12px;border-left:1px solid var(--color-divider)"><div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Profit</div><div style="font-family:var(--font-heading);font-weight:600;font-size:23px;font-feature-settings:'tnum'">{{ snapProfit }}</div><div class="text-muted" style="font-size:11px">after production &amp; fees</div></div>
          <div style="padding-left:12px;border-left:1px solid var(--color-divider)"><div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Margin</div><div style="font-family:var(--font-heading);font-weight:600;font-size:23px;font-feature-settings:'tnum'">{{ snapMargin }}</div><div class="text-muted" style="font-size:11px">labor not set</div></div>
        </div>
      `;

const attentionModule = `
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px"><h6 style="margin:0">Needs your attention</h6><span class="tag tag-accent">{{ attentionCount }}</span></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <sc-for list="{{ attentionItems }}" as="item" hint-placeholder-count="2">
            <div class="card" style="gap:8px">
              <span class="card-kicker">{{ item.kicker }}</span>
              <div style="font-size:14px;line-height:1.5">{{ item.text }}</div>
              <button class="btn btn-ghost" sc-camel-on-click="{{ item.go }}" style="align-self:flex-start;min-height:44px">{{ item.cta }}</button>
            </div>
          </sc-for>
        </div>
      `;

const lastMarketModule = `
        <h6 style="margin-bottom:8px">{{ lastMarketTitle }}</h6>
        <div style="display:flex;flex-direction:column;font-size:13px">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--color-divider)"><span>Revenue</span><span style="font-feature-settings:'tnum'">{{ lastMarketRevenue }}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--color-divider)"><span class="text-muted">Ingredients + booth</span><span class="text-muted" style="font-feature-settings:'tnum'">{{ lastMarketCosts }}</span></div>
          <div style="display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid var(--color-divider);border-bottom:1px solid var(--color-divider)"><span style="font-family:var(--font-heading);font-weight:600;font-size:15px">You kept</span><span style="font-family:var(--font-heading);font-weight:600;font-size:17px;font-feature-settings:'tnum'">{{ lastMarketKept }}</span></div>
        </div>
      `;

const costWatchModule = `
        <div class="card" style="gap:8px">
          <span class="card-kicker">Cost watch</span>
          <div style="font-size:14px;line-height:1.5">{{ costWatchText }}</div>
          <button class="btn btn-ghost" sc-camel-on-click="{{ goAlerts }}" style="align-self:flex-start;min-height:44px">See affected recipes →</button>
        </div>
      `;

// Kept so the module still renders if it is ever switched on, but Baketly has
// no orders model yet, so there is nothing truthful to list.
const ordersModule = `
        <h6 style="margin-bottom:8px">Upcoming orders</h6>
        <div class="text-muted" style="font-size:13px;padding:8px 0;border-top:1px solid var(--color-divider)">No upcoming orders yet.</div>
      `;

const chatModule = `
        <div class="card" style="gap:10px">
          <div style="display:flex;align-items:center;gap:8px"><svg width="15" height="15" sc-camel-view-box="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"></path></svg><span class="card-kicker" style="margin:0">Ask Baketly</span></div>
          <div style="font-size:14px;line-height:1.5">Your bakery's numbers, answered in plain words. Try one:</div>
          <button class="btn btn-secondary" sc-camel-on-click="{{ askGo1 }}" style="justify-content:flex-start;text-align:left;min-height:44px;font-size:12px">{{ askLabel1 }}</button>
          <button class="btn btn-secondary" sc-camel-on-click="{{ askGo3 }}" style="justify-content:flex-start;text-align:left;min-height:44px;font-size:12px">{{ askLabel3 }}</button>
        </div>
      `;

/** The greeting line above the modules. */
function bindHeader(template: string): string {
  const date = ">Baketly · Aug 21<";
  const month = ">August so far: $2,810 · ↑12% vs July<";
  if (!template.includes(date)) throw new Error("Missing home date anchor");
  if (!template.includes(month)) throw new Error("Missing home month anchor");
  return template
    .replace(date, () => ">{{ homeDateLabel }}<")
    .replace(month, () => ">{{ homeMonthLine }}<");
}

export function applyHomeBehavior(template: string): string {
  let out = bindHeader(bindHomeValues(insertHomeData(template)));
  const modules: Array<[string, string]> = [
    ["isRead", readModule],
    ["isHealth", healthModule],
    ["isBestWorst", bestWorstModule],
    ["isNextMarket", nextMarketModule],
    ["isSnapshot", snapshotModule],
    ["isAttention", attentionModule],
    ["isLastMarket", lastMarketModule],
    ["isCostWatch", costWatchModule],
    ["isOrders", ordersModule],
    ["isChatMod", chatModule],
  ];
  for (const [flag, markup] of modules) out = replaceModule(out, flag, markup);
  return out;
}
