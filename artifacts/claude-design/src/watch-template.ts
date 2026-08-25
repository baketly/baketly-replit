// "See what changed": what the baker's ingredient prices have done, what that
// did to each recipe's cost, and what comparable products go for locally.
//
// The mockup shipped this screen as static copy — invented butter and egg
// rises, and an invented before/after table. Everything here is computed from
// the baker's own price history, except the local prices, which come from the
// grounded /api/market-check research.

const watchController = `      ...(() => {
        const money = value => (value < 0 ? '-$' : '$') + Math.abs(value).toFixed(2);
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
            deltaStr: (row.delta > 0 ? '+' : '−') + '$' + Math.abs(row.delta).toFixed(2),
            deltaColor: row.delta > 0 ? '#b0563e' : 'var(--color-accent-700)'
          }));

        // local prices, from the grounded research
        const check = this.state.marketCheck || null;
        // local ranges are quoted in whatever currency the research found, which
        // is not necessarily the baker's own
        const localCurrency = (check && check.currency) ? String(check.currency) : '';
        const localMoney = value => value.toFixed(2) + (localCurrency ? ' ' + localCurrency : '');
        const verdictLabels = { under: 'You charge less', over: 'You charge more', in_range: 'In line locally', unknown: 'Not found' };
        const verdictClasses = { under: 'tag-accent', over: 'tag-accent', in_range: 'tag-neutral', unknown: 'tag-neutral' };
        const localRows = check ? (check.products || []).map(product => ({
          name: product.name,
          yourPrice: money(Number(product.price) || 0),
          rangeStr: product.grounded ? localMoney(Number(product.localLow) || 0) + ' – ' + localMoney(Number(product.localHigh) || 0) + ' nearby' : 'No local prices found',
          note: product.note || '',
          competitors: (product.competitors || []).map(seller => ({
            name: seller.name,
            priceStr: (seller.price !== null && seller.price !== undefined) ? localMoney(Number(seller.price)) : '',
            uri: seller.uri || ''
          })),
          hasCompetitors: (product.competitors || []).length > 0,
          verdictLabel: verdictLabels[product.verdict] || 'Not found',
          verdictClass: verdictClasses[product.verdict] || 'tag-neutral'
        })) : [];

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
          window.__baketlyMarketCheck(location, products).then(result => {
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
          needsLocation: localRows.length === 0 && !(this.state.bakeryLocation || '').trim(),
          awaitingFirstCheck: localRows.length === 0 && !!(this.state.bakeryLocation || '').trim(),
          goLocationSettings: () => this.setState(st => ({ screen: 'settings', stack: [...st.stack, st.screen] })),
          localSummary: check && check.summary ? check.summary : '',
          localCheckedLabel: checkedAt ? 'Checked ' + checkedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + ((check && check.location) || '') : 'Not checked yet',
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
  <sc-if value="{{ hasLocalRows }}" hint-placeholder-val="{{ false }}">
    <div class="an-card">
      <sc-for list="{{ localRows }}" as="loc" hint-placeholder-count="3">
        <div class="an-row">
          <div class="an-row-main">
            <div class="an-row-name">{{ loc.name }}</div>
            <div class="an-row-sub">You charge {{ loc.yourPrice }} · {{ loc.rangeStr }}</div>
            <div class="an-row-sub" style="margin-top:3px">{{ loc.note }}</div>
            <sc-if value="{{ loc.hasCompetitors }}" hint-placeholder-val="{{ false }}">
              <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
                <sc-for list="{{ loc.competitors }}" as="seller" hint-placeholder-count="2">
                  <a href="{{ seller.uri }}" target="_blank" rel="noopener noreferrer" style="font-size:12px;text-decoration:none;border:1px solid var(--color-divider);background:#fff;border-radius:999px;padding:5px 11px;color:var(--color-accent-700)">{{ seller.name }} {{ seller.priceStr }} ↗</a>
                </sc-for>
              </div>
            </sc-if>
          </div>
          <span class="tag {{ loc.verdictClass }}" style="flex:none">{{ loc.verdictLabel }}</span>
        </div>
      </sc-for>
    </div>
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
  const accountBlock =
    '<sc-if value="{{ signedIn }}" hint-placeholder-val="{{ false }}"><div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;padding:13px 14px;margin-bottom:16px"><div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">Signed in as</div><div style="font-size:14px;font-weight:500;overflow-wrap:anywhere;margin-bottom:10px">{{ signedInEmail }}</div><button class="btn btn-secondary" sc-camel-on-click="{{ signOutNow }}" style="min-height:38px;font-size:12px">Sign out</button></div></sc-if>';

  const settingsField =
    '<div class="field"><label>Bakery name</label><input class="input" value="Base Street Bakes"></div>';
  if (!template.includes(settingsField)) throw new Error("Missing settings name field anchor");
  let out = template.replace(
    settingsField,
    () =>
      accountBlock +
      '<div class="field"><label>Bakery name</label><input class="input" value="{{ bakeryName }}" sc-camel-on-change="{{ setBakeryName }}" aria-label="Bakery name" placeholder="e.g. Base Street Bakes"></div>' +
      '<div class="field"><label>Where you sell</label><input class="input" value="{{ bakeryLocation }}" sc-camel-on-change="{{ setBakeryLocation }}" aria-label="Where you sell" placeholder="Start typing a town or address…" autocomplete="off"><sc-if value="{{ hasLocationSuggestions }}" hint-placeholder-val="{{ false }}"><div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;margin-top:6px;overflow:hidden;box-shadow:var(--shadow-sm)"><sc-for list="{{ locationSuggestions }}" as="sug" hint-placeholder-count="0"><div class="bk-row" sc-camel-on-click="{{ sug.choose }}" style="padding:11px 13px;font-size:13px;border-top:1px solid var(--color-divider);cursor:pointer">{{ sug.place }}</div></sc-for></div></sc-if><div class="text-muted" style="font-size:12px;margin-top:5px">Used to compare your prices with bakeries near you.</div></div>',
  );

  const onboardingField =
    '<div class="field" style="margin-bottom:16px"><label>Bakery name</label><input class="input" placeholder="e.g. Base Street Bakes"></div>';
  if (!out.includes(onboardingField)) throw new Error("Missing onboarding name field anchor");
  return out.replace(
    onboardingField,
    () =>
      '<div class="field" style="margin-bottom:16px"><label>Bakery name</label><input class="input" value="{{ bakeryName }}" sc-camel-on-change="{{ setBakeryName }}" aria-label="Bakery name" placeholder="e.g. Base Street Bakes"></div>' +
      '<div class="field" style="margin-bottom:16px"><label>Where do you sell?</label><input class="input" value="{{ bakeryLocation }}" sc-camel-on-change="{{ setBakeryLocation }}" aria-label="Where do you sell" placeholder="Start typing a town or address…" autocomplete="off"><sc-if value="{{ hasLocationSuggestions }}" hint-placeholder-val="{{ false }}"><div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;margin-top:6px;overflow:hidden;box-shadow:var(--shadow-sm)"><sc-for list="{{ locationSuggestions }}" as="sug" hint-placeholder-count="0"><div class="bk-row" sc-camel-on-click="{{ sug.choose }}" style="padding:11px 13px;font-size:13px;border-top:1px solid var(--color-divider);cursor:pointer">{{ sug.place }}</div></sc-for></div></sc-if><div class="text-muted" style="font-size:12px;margin-top:5px">So Baketly can tell you what bakeries near you charge.</div></div>',
  );
}

const profileController = `      bakeryName: this.state.bakeryName || '',
      setBakeryName: e => this.setState({ bakeryName: e.target.value.slice(0, 120) }),
      signedInEmail: window.__baketlySignedInEmail || '',
      signedIn: !!window.__baketlySignedInEmail,
      signOutNow: () => window.__baketlySignOut(),
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
