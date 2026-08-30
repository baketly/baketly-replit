// Scaling a recipe to what you actually need.
//
// A recipe is written for a batch — twelve of them, or two — and the amounts
// stored against it are batch amounts. Every time a baker needs a number that
// is not a batch, they do the arithmetic themselves: what one is, then what
// forty are, for every line. The app already holds both halves of that sum.
//
// The calculator does it. Pick a recipe, say how many you need, and each
// ingredient is scaled from the batch it was written for.

const calculatorController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const recipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const chosenId = this.state.calcRecipeId || (recipes[0] && recipes[0].id) || '';
        const chosen = recipes.find(r => r.id === chosenId) || null;

        // an empty box means you are still typing, not that you want none
        const typed = this.state.calcUnitsText;
        const wanted = Math.max(0, Number(typed != null ? typed : this.state.calcUnits) || 0);
        const made = chosen ? Math.max(1, Number(chosen.yield) || 1) : 1;
        const batches = wanted > 0 ? wanted / made : 0;

        // grams and millilitres get unwieldy in the thousands
        const tidy = value => {
          const rounded = Math.round(value * 100) / 100;
          return String(rounded);
        };
        const measure = (value, unit) => {
          if (unit === 'g' && value >= 1000) return tidy(value / 1000) + ' kg';
          if (unit === 'ml' && value >= 1000) return tidy(value / 1000) + ' L';
          return tidy(value) + ' ' + unit;
        };

        const lines = chosen
          ? (chosen.ingredientKeys || []).map(key => {
              const meta = this.ING_META[key] || {};
              const perBatch = Number((chosen.amounts || {})[key]) || 0;
              const needed = (perBatch / made) * wanted;
              return {
                name: meta.name || key,
                neededStr: measure(needed, meta.unit || 'g'),
                costStr: CUR + (needed * (Number(meta.per) || 0)).toFixed(2)
              };
            })
          : [];

        const packs = chosen
          ? (chosen.packagingKeys || []).map(key => {
              const meta = this.PACK_META[key] || {};
              return {
                label: (meta.name || key) + ' × ' + Math.ceil(wanted)
              };
            })
          : [];

        const ingredientCost = chosen
          ? (chosen.ingredientKeys || []).reduce((sum, key) => {
              const meta = this.ING_META[key] || {};
              return sum + ((Number((chosen.amounts || {})[key]) || 0) / made) * wanted * (Number(meta.per) || 0);
            }, 0)
          : 0;
        const packagingCost = chosen
          ? (chosen.packagingKeys || []).reduce((sum, key) => {
              const meta = this.PACK_META[key] || {};
              return sum + Math.ceil(wanted) * (Number(meta.per) || 0);
            }, 0)
          : 0;
        const labourCost = chosen
          ? ((Number(this.state.hourlyRate) || 0) / 60) * (Number(chosen.activeMinutes) || 0) * (wanted / made)
          : 0;

        const openCalculator = (id, units) => this.setState(st => ({
          calcRecipeId: id || st.calcRecipeId || (recipes[0] && recipes[0].id) || '',
          calcUnits: Math.max(0, Number(units) || 0),
          calcUnitsText: null,
          screen: 'calculator',
          stack: [...st.stack, st.screen]
        }));

        return {
          onCalculator: screen === 'calculator',
          goCalculator: () => openCalculator('', 0),
          openCalculatorFor: openCalculator,

          calcOptions: recipes.map(recipe => ({
            value: recipe.id,
            label: recipe.name || 'Untitled recipe'
          })),
          calcHasRecipes: recipes.length > 0,
          calcHasNoRecipes: recipes.length === 0,
          calcRecipeId: chosenId,
          setCalcRecipe: e => this.setState({ calcRecipeId: e.target.value }),

          calcUnitsValue: typed != null ? String(typed) : (wanted > 0 ? String(wanted) : ''),
          setCalcUnits: e => {
            const raw = String(e.target.value || '').replace(/[^0-9.]/g, '').slice(0, 7);
            this.setState({ calcUnitsText: raw, calcUnits: Math.max(0, Number(raw) || 0) });
          },

          calcBatchNote: !chosen
            ? ''
            : wanted > 0
              ? tidy(batches) + (batches === 1 ? ' batch' : ' batches') + ' of ' + made
              : 'One batch makes ' + made,
          calcUnitWord: wanted === 1 ? 'unit' : 'units',
          calcLines: lines,
          calcHasLines: lines.length > 0,
          calcHasNoLines: !!chosen && lines.length === 0,
          calcPacks: packs,
          calcHasPacks: packs.length > 0,
          calcWanted: wanted > 0,
          calcIngredientCostStr: CUR + ingredientCost.toFixed(2),
          calcPackagingCostStr: CUR + packagingCost.toFixed(2),
          calcLabourCostStr: CUR + labourCost.toFixed(2),
          calcHasLabour: labourCost > 0,
          calcTotalStr: CUR + (ingredientCost + packagingCost + labourCost).toFixed(2)
        };
      })(),
`;

function addCalculatorController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable calculator anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${calculatorController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

const screenMarkup = `<!-- ══ RECIPE CALCULATOR ══ -->
<sc-if value="{{ onCalculator }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <button class="btn btn-ghost" sc-camel-on-click="{{ back }}" style="margin-left:-6px;min-height:44px">‹ Back</button>
  <h2 style="font-size:26px;margin:6px 0 4px">Recipe calculator</h2>
  <p class="text-muted" style="font-size:13px;line-height:1.5;margin-bottom:18px">Your recipes are written for a batch. Pick one and say how many you need, and every ingredient is scaled to that number.</p>

  <sc-if value="{{ calcHasNoRecipes }}" hint-placeholder-val="{{ false }}">
    <div style="text-align:center;padding:44px 20px;background:#fff;border-radius:12px;border:2px dashed var(--color-divider)">
      <div style="font-size:15px;font-weight:500;margin-bottom:4px">No recipes yet</div>
      <div style="font-size:13px;color:var(--color-neutral-500);line-height:1.5">Save a recipe in the pantry and you can scale it here.</div>
    </div>
  </sc-if>

  <sc-if value="{{ calcHasRecipes }}" hint-placeholder-val="{{ true }}">
    <div class="field" style="margin-bottom:14px">
      <label>Recipe</label>
      <div class="an-select-wrap" style="display:block;margin:0">
        <select class="an-select" style="width:100%" value="{{ calcRecipeId }}" sc-camel-on-change="{{ setCalcRecipe }}">
          <sc-for list="{{ calcOptions }}" as="opt" hint-placeholder-count="3">
            <option value="{{ opt.value }}">{{ opt.label }}</option>
          </sc-for>
        </select>
      </div>
    </div>

    <div class="field" style="margin-bottom:6px">
      <label>How many do you need?</label>
      <input class="input" value="{{ calcUnitsValue }}" sc-camel-on-change="{{ setCalcUnits }}" inputmode="decimal" aria-label="How many do you need" placeholder="0" style="font-feature-settings:'tnum'">
    </div>
    <div class="text-muted" style="font-size:12px;margin-bottom:20px">{{ calcBatchNote }}</div>

    <sc-if value="{{ calcHasLines }}" hint-placeholder-val="{{ true }}">
      <h6 style="margin-bottom:8px">Ingredients</h6>
      <div style="display:flex;flex-direction:column;font-size:14px;margin-bottom:20px;border-bottom:1px solid var(--color-divider)">
        <sc-for list="{{ calcLines }}" as="ln" hint-placeholder-count="4">
          <div style="display:grid;grid-template-columns:1fr 92px 52px;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--color-divider)">
            <span style="min-width:0;font-size:14px;overflow-wrap:break-word">{{ ln.name }}</span>
            <span style="text-align:right;font-size:14px;font-weight:500;font-feature-settings:'tnum'">{{ ln.neededStr }}</span>
            <span class="text-muted" style="text-align:right;font-size:13px;font-feature-settings:'tnum'">{{ ln.costStr }}</span>
          </div>
        </sc-for>
      </div>
    </sc-if>

    <sc-if value="{{ calcHasPacks }}" hint-placeholder-val="{{ false }}">
      <h6 style="margin-bottom:8px">Packaging</h6>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
        <sc-for list="{{ calcPacks }}" as="pk" hint-placeholder-count="2">
          <span class="tag tag-neutral" style="font-feature-settings:'tnum'">{{ pk.label }}</span>
        </sc-for>
      </div>
    </sc-if>

    <sc-if value="{{ calcWanted }}" hint-placeholder-val="{{ true }}">
      <div class="an-card">
        <div class="an-ledger-row"><span>Ingredients</span><span class="an-num">{{ calcIngredientCostStr }}</span></div>
        <div class="an-ledger-row"><span>Packaging</span><span class="an-num">{{ calcPackagingCostStr }}</span></div>
        <sc-if value="{{ calcHasLabour }}" hint-placeholder-val="{{ false }}">
          <div class="an-ledger-row"><span>Your time</span><span class="an-num">{{ calcLabourCostStr }}</span></div>
        </sc-if>
        <div class="an-ledger-total"><span class="an-label">Costs to make</span><span class="an-total-num">{{ calcTotalStr }}</span></div>
      </div>
    </sc-if>

    <sc-if value="{{ calcHasNoLines }}" hint-placeholder-val="{{ false }}">
      <div class="text-muted" style="font-size:13px;padding:14px 0">This recipe has no ingredients saved yet, so there is nothing to scale.</div>
    </sc-if>
  </sc-if>
</div>
</sc-if>

`;

/** Sits with the other full screens. */
function addCalculatorScreen(template: string): string {
  const anchor = "<!-- ══ ANALYTICS · ITEMS SOLD BREAKDOWN ══ -->";
  if (!template.includes(anchor)) throw new Error("Missing screen list anchor");
  return template.replace(anchor, () => screenMarkup + anchor);
}

/** A second row of quick actions on Home, so the tile has somewhere to go. */
function addHomeQuickAction(template: string): string {
  const anchor =
    '<button class="btn btn-secondary" sc-camel-on-click="{{ startNewEvent }}" style="flex:1;min-width:0;min-height:66px;flex-direction:column;gap:5px;padding:10px 4px;border-radius:16px">';
  if (!template.includes(anchor)) throw new Error("Missing quick action anchor");
  const closeAt = template.indexOf("</button>\n  </div>", template.indexOf(anchor));
  if (closeAt < 0) throw new Error("Missing quick action row close");
  const tile =
    '\n  <div style="display:flex;gap:8px;margin-top:8px">' +
    '<button class="btn btn-secondary" sc-camel-on-click="{{ goCalculator }}" style="flex:1;min-width:0;min-height:66px;flex-direction:column;gap:5px;padding:10px 4px;border-radius:16px">' +
    '<svg width="18" height="18" sc-camel-view-box="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"></path></svg>' +
    '<span style="font-size:10px;font-weight:600;line-height:1.2;text-align:center">Recipe<br>calculator</span></button>' +
    '<span style="flex:1"></span><span style="flex:1"></span><span style="flex:1"></span></div>';
  const at = closeAt + "</button>\n  </div>".length;
  return template.slice(0, at) + tile + template.slice(at);
}

export function applyCalculatorBehavior(template: string): string {
  return addHomeQuickAction(addCalculatorScreen(addCalculatorController(template)));
}
