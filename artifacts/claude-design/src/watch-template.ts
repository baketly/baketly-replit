// "See what changed": what the baker's ingredient prices have done, what that
// did to each recipe's cost, and what comparable products go for locally.
//
// The mockup shipped this screen as static copy — invented butter and egg
// rises, and an invented before/after table. Everything here is computed from
// the baker's own price history, except the local prices, which come from the
// grounded /api/market-check research.

const watchController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const money = value => (value < 0 ? ('-' + CUR) : CUR) + Math.abs(value).toFixed(2);
        const history = this.state.priceHistory || {};
        const removed = new Set(this.state.removedIngredientKeys || []);

        // an ingredient's cost per unit before its most recent change
        const previousUnitCost = {};
        Object.keys(history).forEach(key => {
          const entries = history[key] || [];
          const last = entries[entries.length - 1];
          if (last) previousUnitCost[key] = Number(last.unitCost) || 0;
        });

        const changedKeys = Object.keys(previousUnitCost).filter(key => !removed.has(key) && this.ING_META[key]);
        const ingredientChanges = changedKeys.map(key => {
          const meta = this.ING_META[key] || {};
          const before = previousUnitCost[key];
          const now = Number(meta.per) || 0;
          const entries = history[key] || [];
          const last = entries[entries.length - 1] || {};
          const saved = (this.state.ingredientRecords || {})[key] || {};
          const pct = before > 0 ? Math.round(((now - before) / before) * 100) : 0;
          return {
            key, name: meta.name || key, pct,
            sortKey: Math.abs(pct),
            supplierLine: (saved.supplier ? saved.supplier + ' · ' : '')
              + money(Number(last.packagePrice) || 0) + ' → ' + money(Number(saved.packagePrice) || 0)
              + ' / ' + (Number(saved.packageSize) || 0) + ' ' + (saved.unit || meta.unit || 'g'),
            pctStr: (pct > 0 ? '+' : '') + pct + '%',
            tagClass: pct > 0 ? 'tag-accent' : 'tag-neutral',
            open: () => this.setState(st => ({ screen: 'ingredientEdit', stack: [...st.stack, st.screen], activeIngredientKey: key, ingredientDraft: null, ingredientSaveError: '' }))
          };
        }).sort((a, b) => b.sortKey - a.sortKey);

        // what those moves did to each recipe's cost to make
        const recipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const recipeCost = (recipe, costOf) => {
          const yieldCount = Math.max(1, Number(recipe.yield) || 1);
          const ingredients = (recipe.ingredientKeys || []).reduce((sum, key) => sum + (Number((recipe.amounts || {})[key]) || 0) * costOf(key), 0);
          const packaging = (recipe.packagingKeys || []).reduce((sum, key) => sum + (this.PACK_META[key] ? this.PACK_META[key].per : 0), 0);
          return ingredients / yieldCount + packaging;
        };
        const costNow = key => (this.ING_META[key] ? Number(this.ING_META[key].per) || 0 : 0);
        const costBefore = key => (key in previousUnitCost ? previousUnitCost[key] : costNow(key));
        const recipeImpacts = recipes.map(recipe => {
          const before = recipeCost(recipe, costBefore);
          const now = recipeCost(recipe, costNow);
          return { name: recipe.name, before, now, delta: now - before };
        }).filter(row => Math.abs(row.delta) >= 0.005)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .map(row => ({
            name: row.name,
            costLine: money(row.before) + ' → ' + money(row.now),
            deltaStr: (row.delta > 0 ? '+' : '−') + CUR + Math.abs(row.delta).toFixed(2),
            deltaColor: row.delta > 0 ? '#b0563e' : 'var(--color-accent-700)'
          }));

        // local prices, from the grounded research
        const check = this.state.marketCheck || null;
        // local ranges are quoted in whatever currency the research found, which
        // is not necessarily the baker's own
        const localCurrency = (check && check.currency) ? String(check.currency) : '';
        const localMoney = value => value.toFixed(2) + (localCurrency ? ' ' + localCurrency : '');
        const verdictLabels = { under: 'You charge less', over: 'You charge more', in_range: 'In line locally' };
        const verdictClasses = { under: 'tag-accent', over: 'tag-accent', in_range: 'tag-neutral' };
        // A product nothing was found for used to get a row saying so and a
        // "Not found" pill beside it. That is not a finding about the bakery,
        // it is the absence of one, and repeated down the list it buried the
        // products that did come back with a price.
        const found = check ? (check.products || []).filter(product => product.grounded === true) : [];
        const missed = check ? (check.products || []).length - found.length : 0;
        // Which way to read a percentage: below the median is the baker's
        // headroom, above it is worth knowing but not an alarm.
        const gapOf = product => {
          const gap = Number(product.differenceFromMedianPercent);
          if (!isFinite(gap)) return null;
          return gap;
        };
        const localRows = found.map(product => {
          const gap = gapOf(product);
          const each = Number(product.unitPrice) || 0;
          const quantity = Number(product.quantity) || 1;
          const median = Number(product.median);
          const suggested = product.suggested || null;
          const sellers = (product.competitors || []);
          return {
            name: product.name,
            yourPrice: money(Number(product.price) || 0),
            yourEach: quantity > 1 && each > 0 ? money(each) + ' each' : '',
            hasYourEach: quantity > 1 && each > 0,
            medianStr: isFinite(median) ? localMoney(median) : '—',
            medianEach: isFinite(median) && quantity > 1 ? localMoney(median / quantity) + ' each' : '',
            hasMedianEach: isFinite(median) && quantity > 1,
            gapStr: gap === null
              ? ''
              : (Math.abs(gap) < 1
                ? 'level with the local median'
                : Math.abs(gap).toFixed(1) + '% ' + (gap < 0 ? 'below' : 'above') + ' local median'),
            gapColor: gap === null || Math.abs(gap) < 1
              ? 'var(--color-text)'
              : (gap < 0 ? 'var(--color-accent-700)' : '#b0563e'),
            rangeStr: (Number(product.localLow) === Number(product.localHigh)
              ? 'one nearby charges ' + localMoney(Number(product.localLow) || 0)
              : localMoney(Number(product.localLow) || 0) + ' – ' + localMoney(Number(product.localHigh) || 0)),
            bakeryCountStr: (Number(product.comparableBakeries) || 0) === 1
              ? '1 comparable bakery'
              : (Number(product.comparableBakeries) || 0) + ' comparable bakeries',
            hasSuggested: !!suggested,
            competitiveStr: suggested ? localMoney(Number(suggested.competitive)) : '',
            marketStr: suggested ? localMoney(Number(suggested.market)) : '',
            premiumStr: suggested ? localMoney(Number(suggested.premium)) : '',
            note: product.note || '',
            // Prices read from a shop's own page, and prices a search turned
            // up, are not the same kind of fact and do not sit in one list.
            verified: product.provenance !== 'ai_search',
            unverified: product.provenance === 'ai_search',
            competitors: sellers.map(seller => ({
              name: seller.name,
              product: seller.product || '',
              hasProduct: !!seller.product,
              priceStr: (seller.price !== null && seller.price !== undefined)
                ? localMoney(Number(seller.price)) + (Number(seller.quantity) > 1 ? ' / ' + seller.quantity : '')
                : '',
              equivalentStr: (seller.equivalentPrice !== null && seller.equivalentPrice !== undefined)
                ? localMoney(Number(seller.equivalentPrice))
                : '',
              distanceStr: (seller.distanceKm !== null && seller.distanceKm !== undefined)
                ? Number(seller.distanceKm).toFixed(1) + ' km'
                : '',
              matchLabel: seller.matchQuality === 'high'
                ? 'close match'
                : (seller.matchQuality === 'medium' ? 'similar' : (seller.matchQuality ? 'loose match' : '')),
              matchColor: seller.matchQuality === 'high' ? 'var(--color-accent-700)' : '#8a8578',
              uri: seller.uri || ''
            })),
            hasCompetitors: sellers.length > 0,
            sellerCountStr: sellers.length === 1
              ? 'from 1 listing'
              : 'from ' + sellers.length + ' listings',
            verdictLabel: verdictLabels[product.verdict] || 'In line locally',
            verdictClass: verdictClasses[product.verdict] || 'tag-neutral'
          };
        });

        const runCheck = () => {
          const location = (this.state.bakeryLocation || '').trim();
          if (!location) {
            this.setState(st => ({ marketError: 'Add where you sell first.', screen: 'settings', stack: [...st.stack, st.screen] }));
            return;
          }
          if (this.state.marketPending) return;
          const products = (Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [])
            .filter(recipe => Number(recipe.price) > 0)
            .slice(0, 12)
            .map(recipe => ({ name: recipe.name, price: Number(recipe.price) }));
          if (!products.length) {
            this.setState({ marketError: 'Add a recipe with a price first.' });
            return;
          }
          this.setState({ marketPending: true, marketError: '' });
          window.__baketlyMarketCheck(location, products, this.state.currency || 'USD').then(result => {
            this.setState({ marketCheck: result, marketPending: false, marketError: '' });
          }).catch(error => {
            this.setState({ marketPending: false, marketError: (error && error.message) ? error.message : 'Couldn\\'t check local prices.' });
          });
        };
        this.__baketlyRunMarketCheck = runCheck;
        // twice a week: due if the last check is older than three and a half days
        if (!this.__baketlyMarketChecked && (this.state.bakeryLocation || '').trim()
            && window.__baketlyMarketCheckDue(this.state.marketCheck)) {
          this.__baketlyMarketChecked = true;
          window.setTimeout(runCheck, 4000);
        }

        const checkedAt = check && check.checkedAt ? new Date(check.checkedAt) : null;
        return {
          watchChanges: ingredientChanges,
          watchHasChanges: ingredientChanges.length > 0,
          watchNoChanges: ingredientChanges.length === 0,
          watchImpacts: recipeImpacts,
          watchHasImpacts: recipeImpacts.length > 0,
          watchIntro: ingredientChanges.length
            ? 'What your ingredient prices have done since you last saved them.'
            : 'Nothing has moved yet. Update an ingredient price and the change shows up here.',
          localRows,
          hasLocalRows: localRows.length > 0,
          noLocalRows: localRows.length === 0,
          // said once, quietly, instead of once per product
          missedNote: missed > 0
            ? 'No local prices found for ' + missed + (missed === 1 ? ' other product.' : ' other products.')
            : '',
          hasMissed: missed > 0,
          needsLocation: localRows.length === 0 && !(this.state.bakeryLocation || '').trim(),
          awaitingFirstCheck: localRows.length === 0 && !!(this.state.bakeryLocation || '').trim(),
          goLocationSettings: () => this.setState(st => ({ screen: 'settings', stack: [...st.stack, st.screen] })),
          localSummary: check && check.summary ? check.summary : '',
          localCheckedLabel: checkedAt ? 'Checked ' + checkedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + ((check && check.location) || '') : 'Not checked yet',
          // what the check actually looked at, so a thin result is explicable
          localReachLabel: check && Number(check.bakeriesFound) > 0
            ? Number(check.bakeriesFound) + ' bakeries nearby · '
              + (Number(check.bakeriesWithProducts) || 0) + ' with prices on their website · '
              + (Number(check.competitorProducts) || 0) + ' products read'
            : '',
          hasLocalReach: !!(check && Number(check.bakeriesFound) > 0),

          // Shops whose websites Baketly could not read are still shops the
          // baker can open and look at, so they are listed rather than dropped.
          unreadBakeries: (check && Array.isArray(check.unread) ? check.unread : []).map(shop => ({
            name: shop.name,
            website: shop.website,
            detail: ((shop.distanceKm !== null && shop.distanceKm !== undefined)
              ? Number(shop.distanceKm).toFixed(1) + ' km · '
              : '') + (shop.reason || '')
          })),
          hasUnreadBakeries: !!(check && Array.isArray(check.unread) && check.unread.length > 0),
          localSources: check && Array.isArray(check.sources) ? check.sources.map(source => ({ title: source.title || source.uri })) : [],
          hasLocalSources: !!(check && Array.isArray(check.sources) && check.sources.length),
          marketPending: this.state.marketPending === true,
          marketError: this.state.marketError || '',
          runMarketCheck: runCheck
        };
      })(),
`;

function replaceWatchScreen(template: string): string {
  const start = template.indexOf('<sc-if value="{{ onAlerts }}"');
  if (start === -1) throw new Error("Missing alerts screen anchor");
  const end = template.indexOf("<!-- ══", start);
  if (end === -1) throw new Error("Unclosed alerts screen");
  const markup = `<sc-if value="{{ onAlerts }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <button class="btn btn-ghost" sc-camel-on-click="{{ back }}" style="margin-left:-6px;min-height:44px">‹ Back</button>
  <h2 style="font-size:28px;margin:6px 0 0">What changed</h2>
  <p class="an-detail-sub">{{ watchIntro }}</p>

  <sc-if value="{{ watchHasChanges }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">Ingredient prices</div>
    <div style="display:flex;flex-direction:column;margin-bottom:8px">
      <sc-for list="{{ watchChanges }}" as="chg" hint-placeholder-count="3">
        <div class="bk-row" sc-camel-on-click="{{ chg.open }}" style="display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--color-divider);cursor:pointer">
          <div style="flex:1;min-width:0"><div style="font-size:15px">{{ chg.name }}</div><div class="text-muted" style="font-size:12px">{{ chg.supplierLine }}</div></div>
          <span class="tag {{ chg.tagClass }}" style="font-feature-settings:'tnum';flex:none">{{ chg.pctStr }}</span>
        </div>
      </sc-for>
    </div>
  </sc-if>

  <sc-if value="{{ watchHasImpacts }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">Cost to make, before → now</div>
    <div class="an-card">
      <sc-for list="{{ watchImpacts }}" as="imp" hint-placeholder-count="3">
        <div class="an-row">
          <div class="an-row-main">
            <div class="an-row-name">{{ imp.name }}</div>
            <div class="an-row-sub">{{ imp.costLine }}</div>
          </div>
          <div class="an-row-val" style="color:{{ imp.deltaColor }}">{{ imp.deltaStr }}</div>
        </div>
      </sc-for>
    </div>
  </sc-if>

  <div class="an-section-title">Local prices</div>
  <div class="text-muted" style="font-size:12px;margin-bottom:8px">{{ localCheckedLabel }}</div>
  <sc-if value="{{ localSummary }}" hint-placeholder-val="">
    <div class="an-card" style="padding:14px"><div style="font-size:14px;line-height:1.5">{{ localSummary }}</div></div>
  </sc-if>
  <sc-if value="{{ hasLocalReach }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="font-size:11px;margin:-4px 0 10px">{{ localReachLabel }}</div>
  </sc-if>
  <sc-if value="{{ hasLocalRows }}" hint-placeholder-val="{{ false }}">
    <sc-for list="{{ localRows }}" as="loc" hint-placeholder-count="3">
      <div class="an-card" style="padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">
          <div style="font-family:var(--font-heading);font-weight:600;font-size:16px;min-width:0;overflow-wrap:anywhere">{{ loc.name }}</div>
          <span class="tag {{ loc.verdictClass }}" style="flex:none">{{ loc.verdictLabel }}</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <div class="text-muted" style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px">Your price</div>
            <div style="font-family:var(--font-heading);font-weight:600;font-size:19px;font-feature-settings:'tnum'">{{ loc.yourPrice }}</div>
            <sc-if value="{{ loc.hasYourEach }}" hint-placeholder-val="{{ false }}"><div class="text-muted" style="font-size:11px">{{ loc.yourEach }}</div></sc-if>
          </div>
          <div>
            <div class="text-muted" style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px">Local median</div>
            <div style="font-family:var(--font-heading);font-weight:600;font-size:19px;font-feature-settings:'tnum'">{{ loc.medianStr }}</div>
            <sc-if value="{{ loc.hasMedianEach }}" hint-placeholder-val="{{ false }}"><div class="text-muted" style="font-size:11px">{{ loc.medianEach }}</div></sc-if>
          </div>
        </div>

        <div style="font-size:13px;font-weight:600;color:{{ loc.gapColor }};margin-bottom:2px">{{ loc.gapStr }}</div>
        <div class="text-muted" style="font-size:12px;margin-bottom:10px">Market range {{ loc.rangeStr }} · {{ loc.bakeryCountStr }}</div>

        <sc-if value="{{ loc.hasSuggested }}" hint-placeholder-val="{{ false }}">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--color-divider);border-radius:var(--radius-md);background:#fff;margin-bottom:10px">
            <div style="padding:9px 10px">
              <div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Competitive</div>
              <div style="font-weight:600;font-size:15px;font-feature-settings:'tnum'">{{ loc.competitiveStr }}</div>
            </div>
            <div style="padding:9px 10px;border-left:1px solid var(--color-divider)">
              <div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Market</div>
              <div style="font-weight:600;font-size:15px;font-feature-settings:'tnum'">{{ loc.marketStr }}</div>
            </div>
            <div style="padding:9px 10px;border-left:1px solid var(--color-divider)">
              <div class="text-muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Premium</div>
              <div style="font-weight:600;font-size:15px;font-feature-settings:'tnum'">{{ loc.premiumStr }}</div>
            </div>
          </div>
        </sc-if>

        <div style="font-size:13px;line-height:1.5;margin-bottom:8px">{{ loc.note }}</div>

        <sc-if value="{{ loc.unverified }}" hint-placeholder-val="{{ false }}">
          <div class="text-muted" style="font-size:11px;line-height:1.45;margin-bottom:8px;padding:8px 10px;border-radius:10px;background:var(--color-accent-100)">Found by web search rather than read from a shop's own page, so it is not counted in the numbers above.</div>
        </sc-if>

        <sc-if value="{{ loc.hasCompetitors }}" hint-placeholder-val="{{ false }}">
          <div class="text-muted" style="font-size:11px;margin-bottom:4px">{{ loc.sellerCountStr }} · tap to see the page it came from</div>
          <div style="display:flex;flex-direction:column;border-top:1px solid var(--color-divider)">
            <sc-for list="{{ loc.competitors }}" as="seller" hint-placeholder-count="3">
              <a href="{{ seller.uri }}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--color-divider);text-decoration:none;color:inherit">
                <span style="flex:1;min-width:0">
                  <span style="font-size:13px;display:block;overflow-wrap:anywhere">{{ seller.name }}</span>
                  <sc-if value="{{ seller.hasProduct }}" hint-placeholder-val="{{ false }}"><span class="text-muted" style="font-size:11px;display:block;overflow-wrap:anywhere">{{ seller.product }}</span></sc-if>
                  <span class="text-muted" style="font-size:11px">{{ seller.distanceStr }} · <span style="color:{{ seller.matchColor }}">{{ seller.matchLabel }}</span></span>
                </span>
                <span style="flex:none;text-align:right">
                  <span style="font-size:13px;font-weight:600;font-feature-settings:'tnum';display:block">{{ seller.equivalentStr }}</span>
                  <span class="text-muted" style="font-size:11px;font-feature-settings:'tnum'">{{ seller.priceStr }} ↗</span>
                </span>
              </a>
            </sc-for>
          </div>
        </sc-if>
      </div>
    </sc-for>
    <sc-if value="{{ hasMissed }}" hint-placeholder-val="{{ false }}">
      <div class="text-muted" style="font-size:12px;margin:-8px 0 16px">{{ missedNote }}</div>
    </sc-if>
  </sc-if>
  <sc-if value="{{ needsLocation }}" hint-placeholder-val="{{ false }}">
    <div class="an-card" sc-camel-on-click="{{ goLocationSettings }}" style="padding:14px;cursor:pointer;border-color:var(--color-accent)">
      <div style="font-size:14px;line-height:1.5;margin-bottom:6px">Baketly checks what bakeries near you charge, twice a week. It needs to know where you sell.</div>
      <div style="font-size:13px;font-weight:600;color:var(--color-accent-700)">Add where you sell ›</div>
    </div>
  </sc-if>
  <sc-if value="{{ awaitingFirstCheck }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="font-size:13px;padding:6px 0 12px">No local prices yet. Baketly checks twice a week, or check now.</div>
  </sc-if>
  <sc-if value="{{ hasLocalSources }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="font-size:11px;margin-bottom:10px">Found on: <sc-for list="{{ localSources }}" as="src" hint-placeholder-count="2"><span>{{ src.title }} </span></sc-for></div>
  </sc-if>
  <sc-if value="{{ hasUnreadBakeries }}" hint-placeholder-val="{{ false }}">
    <div class="an-section-title">Worth a look yourself</div>
    <div class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:8px">Baketly could not read prices from these nearby bakeries. Their websites open in your browser.</div>
    <div style="display:flex;flex-direction:column;border-top:1px solid var(--color-divider);margin-bottom:16px">
      <sc-for list="{{ unreadBakeries }}" as="shop" hint-placeholder-count="3">
        <a href="{{ shop.website }}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--color-divider);text-decoration:none;color:inherit;min-height:44px">
          <span style="flex:1;min-width:0">
            <span style="font-size:14px;display:block;overflow-wrap:anywhere">{{ shop.name }}</span>
            <span class="text-muted" style="font-size:11px;overflow-wrap:anywhere">{{ shop.detail }}</span>
          </span>
          <span style="flex:none;font-size:12px;font-weight:600;color:var(--color-accent-700)">Open ↗</span>
        </a>
      </sc-for>
    </div>
  </sc-if>
  <sc-if value="{{ marketError }}" hint-placeholder-val="">
    <div style="color:#b0563e;font-size:12px;margin-bottom:8px">{{ marketError }}</div>
  </sc-if>
  <sc-if value="{{ marketPending }}" hint-placeholder-val="{{ false }}">
    <div class="text-muted" style="font-size:12px;margin-bottom:8px">Checking prices near you…</div>
  </sc-if>
  <button class="btn btn-secondary btn-block" sc-camel-on-click="{{ runMarketCheck }}" style="min-height:44px">Check local prices now</button>
</div>
</sc-if>

`;
  return template.slice(0, start) + markup + template.slice(end);
}

function addWatchController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) {
    throw new Error("Missing stable watch controller anchor");
  }
  return template.replace(
    anchor,
    (_match, indent: string) => `${watchController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

// Where the baker sells, asked for once during onboarding and editable later.
function addLocationFields(template: string): string {
  const sampleBlock =
    '<div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;padding:13px 14px;margin-bottom:16px"><div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">Sample bakery</div><sc-if value="{{ sampleNotLoaded }}" hint-placeholder-val="{{ true }}"><div class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">Fill the app with a demo pantry, recipes and six months of sales, to try things out. It replaces what is here.</div><button class="btn btn-secondary" sc-camel-on-click="{{ loadSampleData }}" style="min-height:38px;font-size:12px">Load sample data</button></sc-if><sc-if value="{{ sampleLoaded }}" hint-placeholder-val="{{ false }}"><div class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">Sample data is loaded. Clearing it empties the pantry, recipes, sales and events.</div><button class="btn btn-secondary" sc-camel-on-click="{{ clearSampleData }}" style="min-height:38px;font-size:12px;color:#b0563e">Clear everything</button></sc-if></div>';

  const accountBlock =
    '<sc-if value="{{ signedIn }}" hint-placeholder-val="{{ false }}"><div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;padding:13px 14px;margin-bottom:16px"><div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">Signed in as</div><div style="font-size:14px;font-weight:500;overflow-wrap:anywhere;margin-bottom:10px">{{ signedInEmail }}</div><button class="btn btn-secondary" sc-camel-on-click="{{ signOutNow }}" style="min-height:38px;font-size:12px">Sign out</button></div></sc-if>';

  const settingsField =
    '<div class="field"><label>Bakery name</label><input class="input" value="Base Street Bakes"></div>';
  if (!template.includes(settingsField)) throw new Error("Missing settings name field anchor");
  let out = template.replace(
    settingsField,
    () =>
      accountBlock +
      sampleBlock +
      '<div class="field"><label>Bakery name</label><input class="input" value="{{ bakeryName }}" sc-camel-on-change="{{ setBakeryName }}" aria-label="Bakery name" placeholder="e.g. Base Street Bakes"></div>' +
      '<div class="field"><label>Where you sell</label><input class="input" value="{{ bakeryLocation }}" sc-camel-on-change="{{ setBakeryLocation }}" aria-label="Where you sell" placeholder="Start typing a town or address…" autocomplete="off"><sc-if value="{{ hasLocationSuggestions }}" hint-placeholder-val="{{ false }}"><div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;margin-top:6px;overflow:hidden;box-shadow:var(--shadow-sm)"><sc-for list="{{ locationSuggestions }}" as="sug" hint-placeholder-count="0"><div class="bk-row" sc-camel-on-click="{{ sug.choose }}" style="padding:11px 13px;font-size:13px;border-top:1px solid var(--color-divider);cursor:pointer">{{ sug.place }}</div></sc-for></div></sc-if><div class="text-muted" style="font-size:12px;margin-top:5px">Used to compare your prices with bakeries near you.</div></div>',
  );

  // Step one of onboarding owns these same fields; see onboarding-template.
  return out;
}

const profileController = `      bakeryName: this.state.bakeryName || '',
      setBakeryName: e => this.setState({ bakeryName: e.target.value.slice(0, 120) }),
      signedInEmail: window.__baketlySignedInEmail || '',
      signedIn: !!window.__baketlySignedInEmail,
      signOutNow: () => window.__baketlySignOut(),
      sampleLoaded: this.state.sampleDataLoaded === true,
      sampleNotLoaded: this.state.sampleDataLoaded !== true,
      loadSampleData: () => this.setState(window.__baketlySampleWorkspace(this.ING_META || {}, this.PACK_META || {})),
      clearSampleData: () => this.setState(window.__baketlyEmptyWorkspace()),
      bakeryLocation: this.state.bakeryLocation || '',
      locationSuggestions: (Array.isArray(this.state.locationSuggestions) ? this.state.locationSuggestions : []).map(place => ({
        place,
        choose: () => this.setState({ bakeryLocation: place, locationSuggestions: [] })
      })),
      hasLocationSuggestions: Array.isArray(this.state.locationSuggestions) && this.state.locationSuggestions.length > 0,
      setBakeryLocation: e => {
        const value = e.target.value.slice(0, 160);
        this.setState({ bakeryLocation: value });
        // debounced: the geocoder is only asked once typing pauses
        if (this.__baketlyPlaceTimer) window.clearTimeout(this.__baketlyPlaceTimer);
        this.__baketlyPlaceTimer = window.setTimeout(() => {
          const query = (this.state.bakeryLocation || '').trim();
          if (query.length < 3) { this.setState({ locationSuggestions: [] }); return; }
          window.__baketlySuggestPlaces(query).then(places => {
            if ((this.state.bakeryLocation || '').trim() === query) this.setState({ locationSuggestions: places });
          });
        }, 400);
      },
`;

function addProfileBindings(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable profile anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${profileController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

// The Markets "+ New event" button opened a mockup form with hardcoded values
// and no bindings, so nothing typed there was ever saved. Send it to the real
// event screen instead, on a fresh event.
function fixNewEventButton(template: string): string {
  const anchor =
    '<button class="btn btn-primary" sc-camel-on-click="{{ goEventNew }}" style="min-height:44px;padding:8px 10px;white-space:nowrap;flex:none">+ New event</button>';
  if (!template.includes(anchor)) throw new Error("Missing new event button anchor");
  return template.replace(
    anchor,
    () =>
      '<button class="btn btn-primary" sc-camel-on-click="{{ startNewEvent }}" style="min-height:44px;padding:8px 10px;white-space:nowrap;flex:none">+ New event</button>',
  );
}

export function applyWatchBehavior(template: string): string {
  return fixNewEventButton(
    addLocationFields(
      addProfileBindings(addWatchController(replaceWatchScreen(template))),
    ),
  );
}
