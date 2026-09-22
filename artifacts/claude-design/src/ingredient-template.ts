// Shared with the recipe ingredient picker, which offers these as filters.
export const INGREDIENT_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ["flour", "Flour"],
  ["sugar", "Sugar"],
  ["chocolate", "Chocolate"],
  ["dairy", "Dairy"],
  ["egg", "Eggs"],
  ["fat", "Fats & oils"],
  ["nut", "Nuts & seeds"],
  ["fruit", "Fruit"],
  ["spice", "Spices & extracts"],
  ["other", "Other"],
];
const categoryKeys = INGREDIENT_CATEGORIES.map(([key]) => key);

export const defaultIngredientDetails = {
  flour: { supplier: "Costco", category: "flour", packagePrice: 12.99, packageSize: 10000, unit: "g", kcal: 364, protein: 10.3, carbs: 76.3, fat: 1 },
  butter: { supplier: "Costco", category: "dairy", packagePrice: 4.28, packageSize: 454, unit: "g", kcal: 717, protein: 0.9, carbs: 0.1, fat: 81 },
  choc: { supplier: "Costco", category: "chocolate", packagePrice: 9.65, packageSize: 2000, unit: "g", kcal: 479, protein: 4.2, carbs: 63, fat: 24 },
  milk: { supplier: "Costco", category: "dairy", packagePrice: 3.49, packageSize: 2000, unit: "ml", kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
  eggs: { supplier: "Costco", category: "egg", packagePrice: 5.93, packageSize: 12, unit: "pc", kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
  whitechoc: { supplier: "Costco", category: "chocolate", packagePrice: 11.49, packageSize: 2000, unit: "g", kcal: 539, protein: 5.9, carbs: 59, fat: 32 },
  nutella: { supplier: "Costco", category: "chocolate", packagePrice: 9.99, packageSize: 950, unit: "g", kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
  vanilla: { supplier: "Costco", category: "spice", packagePrice: 14.99, packageSize: 118, unit: "ml", kcal: 288, protein: 0.1, carbs: 12.7, fat: 0.1 },
  cheddar: { supplier: "Costco", category: "dairy", packagePrice: 10.99, packageSize: 907, unit: "g", kcal: 403, protein: 24.9, carbs: 1.3, fat: 33.1 },
} as const;

const ingredientListMarkup = `<sc-if value="{{ pantryOnIng }}" hint-placeholder-val="{{ false }}">
  <div style="display:flex;flex-direction:column;border-bottom:1px solid var(--color-divider)">
    <sc-for list="{{ ingredientItems }}" as="item" hint-placeholder-count="8">
      <div class="bk-row" sc-camel-on-click="{{ item.open }}" style="display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--color-divider);cursor:pointer">
        <div style="flex:1;min-width:0"><div style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ item.name }}</div><div class="text-muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ item.packageLine }}</div></div>
        <div style="text-align:right;font-feature-settings:'tnum';font-size:14px;flex:none">{{ item.costLine }}</div>
      </div>
    </sc-for>
  </div>
  </sc-if>`;

const ingredientEditorMarkup = `<!-- ══ INGREDIENT EDIT ══ -->
<sc-if value="{{ onIngredientEdit }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><button class="btn btn-ghost" sc-camel-on-click="{{ cancelIngredientEdit }}" style="margin-left:-6px;min-height:44px">‹ Ingredients</button><sc-if value="{{ ingredientExisting }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ requestDeleteIngredient }}" style="min-height:44px;color:#b0563e">Delete</button></sc-if></div>
  <div class="field" style="margin:6px 0 12px"><label>Ingredient name</label><input class="input" value="{{ ingredientName }}" sc-camel-on-change="{{ setIngredientName }}" placeholder="Name your ingredient" aria-label="Ingredient name" style="font-family:var(--font-heading);font-weight:600;font-size:22px;padding:10px 12px"></div>
  <p class="text-muted" style="font-size:13px;margin-bottom:18px">Update this pantry item. Recipe costs will use the saved unit cost.</p>
  <sc-if value="{{ ingredientNew }}" hint-placeholder-val="{{ false }}"><div style="padding:12px;border:1px solid var(--color-divider);border-radius:14px;background:#fff;margin-bottom:18px"><div style="font-weight:600;font-size:14px;margin-bottom:4px">Have the package nearby?</div><div class="text-muted" style="font-size:12px;margin-bottom:9px">Let Baketly read the nutrition label and fill in what it can.</div><label class="btn btn-secondary" style="min-height:40px;position:relative;overflow:hidden;cursor:pointer">Scan label with photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" sc-camel-on-change="{{ scanIngredientLabel }}" aria-label="Scan label with photo" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label><sc-if value="{{ ingredientScanLoading }}" hint-placeholder-val="{{ false }}"><div style="display:flex;align-items:center;gap:9px;margin-top:10px"><span class="bk-spinner" aria-hidden="true"></span><span class="text-muted" style="font-size:12px">Reading the label… this takes a few seconds.</span></div></sc-if><sc-if value="{{ ingredientScanError }}" hint-placeholder-val=""><div style="color:#b0563e;font-size:12px;margin-top:8px">{{ ingredientScanError }}</div></sc-if><sc-if value="{{ ingredientScanComplete }}" hint-placeholder-val="{{ false }}"><div style="color:var(--color-accent);font-size:12px;margin-top:8px">Filled what I could. Please review every field before saving.</div></sc-if></div></sc-if>
  <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px">
    <div class="field"><label>Supplier</label><input class="input" value="{{ ingredientSupplier }}" sc-camel-on-change="{{ setIngredientSupplier }}" aria-label="Ingredient supplier"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field"><label>Package price</label><input class="input" value="{{ ingredientPackagePrice }}" sc-camel-on-change="{{ setIngredientPackagePrice }}" inputmode="decimal" aria-label="Package price" style="font-feature-settings:'tnum'"></div>
      <div class="field"><label>Package size</label><input class="input" value="{{ ingredientPackageSize }}" sc-camel-on-change="{{ setIngredientPackageSize }}" inputmode="decimal" aria-label="Package size"></div>
    </div>
     <div class="field"><label>Unit</label><select class="input" value="{{ ingredientUnit }}" sc-camel-on-change="{{ setIngredientUnit }}" aria-label="Ingredient unit"><option value="g">g</option><option value="kg">kg</option><option value="oz">oz</option><option value="lb">lb</option><option value="ml">ml</option><option value="pc">pc</option></select></div>
     <div class="field"><label>Category</label><select class="input" value="{{ ingredientCategory }}" sc-camel-on-change="{{ setIngredientCategory }}" aria-label="Ingredient category"><option value="flour">Flour</option><option value="sugar">Sugar</option><option value="chocolate">Chocolate</option><option value="dairy">Dairy</option><option value="egg">Eggs</option><option value="fat">Fats &amp; oils</option><option value="nut">Nuts &amp; seeds</option><option value="fruit">Fruit</option><option value="spice">Spices &amp; extracts</option><option value="other">Other</option></select></div>
     <sc-if value="{{ ingredientServingVisible }}" hint-placeholder-val="{{ false }}"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="field"><label>Serving size</label><input class="input" value="{{ ingredientServingSize }}" sc-camel-on-change="{{ setIngredientServingSize }}" inputmode="decimal" aria-label="Serving size"></div><div class="field"><label>Serving unit</label><input class="input" value="{{ ingredientServingUnit }}" sc-camel-on-change="{{ setIngredientServingUnit }}" aria-label="Serving unit" placeholder="g"></div></div></sc-if>
  </div>
  <div style="border-top:2px solid var(--color-text);padding-top:12px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:baseline">
    <span style="font-family:var(--font-heading);font-weight:600;font-size:17px">Cost per {{ ingredientUnit }}</span>
    <span style="font-family:var(--font-heading);font-weight:600;font-size:26px;font-feature-settings:'tnum'">{{ ingredientCostPer }}</span>
  </div>
  <h6 style="margin-bottom:8px">Nutrition · per 100 {{ ingredientNutritionUnit }}</h6>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px">
    <div class="field"><label>Calories</label><input class="input" value="{{ ingredientKcal }}" sc-camel-on-change="{{ setIngredientKcal }}" inputmode="decimal" aria-label="Calories"></div>
    <div class="field"><label>Protein (g)</label><input class="input" value="{{ ingredientProtein }}" sc-camel-on-change="{{ setIngredientProtein }}" inputmode="decimal" aria-label="Protein"></div>
    <div class="field"><label>Carbs (g)</label><input class="input" value="{{ ingredientCarbs }}" sc-camel-on-change="{{ setIngredientCarbs }}" inputmode="decimal" aria-label="Carbs"></div>
    <div class="field"><label>Fat (g)</label><input class="input" value="{{ ingredientFat }}" sc-camel-on-change="{{ setIngredientFat }}" inputmode="decimal" aria-label="Fat"></div>
     <div class="field"><label>Sugar (g)</label><input class="input" value="{{ ingredientSugar }}" sc-camel-on-change="{{ setIngredientSugar }}" inputmode="decimal" aria-label="Sugar"></div>
  </div>
  <sc-if value="{{ ingredientSaveError }}" hint-placeholder-val=""><div style="color:#b0563e;font-size:12px;margin-bottom:10px">{{ ingredientSaveError }}</div></sc-if>
  <button class="btn btn-primary btn-block" sc-camel-on-click="{{ saveIngredient }}" style="min-height:48px">Save ingredient</button>
  <sc-if value="{{ ingredientDeleteOpen }}" hint-placeholder-val="{{ false }}"><div role="dialog" aria-modal="true" aria-label="Delete ingredient confirmation" style="position:fixed;inset:0;z-index:40;background:rgba(30,27,22,.42);display:flex;align-items:center;justify-content:center;padding:20px"><div class="card" style="width:min(100%,340px);padding:22px;gap:12px"><h3 style="margin:0">Delete ingredient?</h3><p class="text-muted" style="font-size:13px;margin:0">Delete {{ ingredientDeleteName }}? It will also be removed from recipes that use it.</p><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px"><button class="btn btn-secondary" sc-camel-on-click="{{ cancelDeleteIngredient }}">Cancel</button><button class="btn btn-primary" sc-camel-on-click="{{ confirmDeleteIngredient }}" style="background:#b0563e;border-color:#b0563e">Delete</button></div></div></div></sc-if>
</div>
</sc-if>

<!-- ══ SCAN PRODUCT ══ -->`;

function addIngredientState(template: string): string {
  return template.replace(
    /activeRecipeId: 'mini-chocolate-babka', recipeDraft: null,\n\s*packagingRecords: \{\},\n\s*removedPackagingKeys: \[\],\n\s*evQty:/,
    () =>
      "activeRecipeId: 'mini-chocolate-babka', recipeDraft: null,\n    packagingRecords: {},\n    removedPackagingKeys: [],\n    ingredientRecords: {}, removedIngredientKeys: [], activeIngredientKey: 'butter', ingredientDraft: null, ingredientSaveError: '', ingredientScanRequest: 0, ingredientScanLoading: false, ingredientScanError: '', ingredientScanComplete: false,\n    evQty:",
  );
}

function replaceIngredientList(template: string): string {
  return template.replace(
    /<sc-if value="\{\{ pantryOnIng \}\}"[\s\S]*?<\/sc-if>\n  <sc-if value="\{\{ pantryOnPack \}\}"/,
    () => `${ingredientListMarkup}
  <sc-if value="{{ pantryOnPack }}"`,
  );
}

function replaceIngredientEditor(template: string): string {
  return template.replace(
    /<!-- ══ ADD \/ EDIT INGREDIENT ══ -->[\s\S]*?<!-- ══ SCAN PRODUCT ══ -->/,
    () => ingredientEditorMarkup,
  );
}

function addIngredientController(template: string): string {
  const defaults = JSON.stringify(defaultIngredientDetails);
  const controller = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const detailDefaults = ${defaults};
        const savedIngredients = this.state.ingredientRecords || {};
        const removedIngredientKeys = new Set(this.state.removedIngredientKeys || []);
        // Only what this baker has saved. The page ships with product metadata
        // for the sample bakery, and treating those keys as pantry items is what
        // used to put nine ingredients in a brand new account.
        const ingredientKeys = Object.keys(savedIngredients).filter(key => !removedIngredientKeys.has(key));
        const units = ['g', 'kg', 'oz', 'lb', 'ml', 'pc'];
        const categories = ${JSON.stringify(categoryKeys)};
        const normalize = (key, draft) => {
          const base = this.ING_META[key] || { name: key, per: 0, unit: 'g' };
          const fallback = detailDefaults[key] || { supplier: '', packagePrice: 0, packageSize: 1, unit: base.unit || 'g', kcal: 0, protein: 0, carbs: 0, fat: 0 };
          const source = { ...fallback, ...(savedIngredients[key] || {}), ...(draft || {}) };
          return {
            name: String(source.name || base.name || key).slice(0, 160),
            supplier: String(source.supplier || '').slice(0, 160),
            packagePrice: Math.max(0, Number(source.packagePrice) || 0),
            packageSize: Math.max(0, Number(source.packageSize) || 0),
            unit: units.includes(source.unit) ? source.unit : (base.unit || 'g'),
            category: categories.includes(source.category) ? source.category : 'other',
            kcal: Math.max(0, Number(source.kcal) || 0),
            protein: Math.max(0, Number(source.protein) || 0),
            carbs: Math.max(0, Number(source.carbs) || 0),
             fat: Math.max(0, Number(source.fat) || 0),
             sugar: Math.max(0, Number(source.sugar) || 0),
             ...(Number(source.servingSize) > 0 ? { servingSize: Math.max(0, Number(source.servingSize) || 0), servingUnit: String(source.servingUnit || '').slice(0, 30) } : {}),
          };
        };
        ingredientKeys.forEach(key => {
          const effective = normalize(key);
          const per = effective.packageSize > 0 ? effective.packagePrice / effective.packageSize : 0;
          this.ING_META[key] = { ...this.ING_META[key], name: effective.name, unit: effective.unit, category: effective.category, per };
        });
        const activeKey = this.state.activeIngredientKey && ingredientKeys.includes(this.state.activeIngredientKey) ? this.state.activeIngredientKey : null;
         const blankIngredient = { name: '', supplier: '', packagePrice: '', packageSize: '', unit: 'g', category: 'other', kcal: '', protein: '', carbs: '', fat: '', sugar: '', servingSize: '', servingUnit: '' };
        const active = activeKey ? normalize(activeKey, this.state.ingredientDraft) : { ...blankIngredient, ...(this.state.ingredientDraft || {}) };
        // Numeric fields round-trip through normalize(), which coerces with Number().
        // Showing that coerced value back in the input erases an in-progress decimal
        // point ('12.' -> 12 -> "12"), so the user can never type one. Display the raw
        // draft text while editing; normalize() still governs cost math and saving.
        const draftText = field => { const draft = this.state.ingredientDraft; return draft && typeof draft[field] === 'string' ? draft[field] : String(active[field] ?? ''); };
        const setDraft = update => this.setState(st => ({ ingredientDraft: { ...active, ...(st.ingredientDraft || {}), ...update }, ingredientSaveError: '' }));
        const deleteIngredient = key => this.setState(st => {
          const ingredientRecords = { ...(st.ingredientRecords || {}) };
          delete ingredientRecords[key];
          const recipeRecords = (st.recipeRecords || []).map(recipe => {
            const amounts = { ...(recipe.amounts || {}) };
            delete amounts[key];
            return { ...recipe, ingredientKeys: (recipe.ingredientKeys || []).filter(ingredientKey => ingredientKey !== key), amounts };
          });
          const stack = [...st.stack];
          const previous = stack.pop() || 'ingredients';
          return { ingredientRecords, removedIngredientKeys: [...new Set([...(st.removedIngredientKeys || []), key])], recipeRecords, screen: previous, stack, activeIngredientKey: null, ingredientDraft: null, ingredientDeleteOpen: false, ingredientSaveError: '' };
        });
        return {
          ingredientItems: ingredientKeys.map(key => {
            const item = normalize(key);
            const per = item.packageSize > 0 ? item.packagePrice / item.packageSize : 0;
            return {
              key, name: item.name,
              packageLine: item.supplier + (' · ' + CUR) + item.packagePrice.toFixed(2) + ' / ' + item.packageSize + ' ' + item.unit,
              costLine: CUR + per.toFixed(per < 0.01 ? 4 : 2) + '/' + item.unit,
              tag: per === 0 ? 'needs price' : 'saved',
              tagClass: per === 0 ? 'tag-accent' : 'tag-neutral',
              open: () => this.setState(st => ({ screen: 'ingredientEdit', stack: [...st.stack, st.screen], activeIngredientKey: key, ingredientDraft: normalize(key), ingredientSaveError: '', ingredientDeleteOpen: false, fromScan: false })),
              remove: () => deleteIngredient(key)
            };
          }),
          ingredientName: active.name,
          ingredientSupplier: active.supplier,
          ingredientPackagePrice: draftText('packagePrice'),
          ingredientPackageSize: draftText('packageSize'),
          ingredientUnit: active.unit,
          ingredientCategory: active.category || 'other',
          ingredientNutritionUnit: active.unit === 'ml' ? 'ml' : active.unit === 'pc' ? 'pc' : 'g',
          ingredientKcal: draftText('kcal'),
          ingredientProtein: draftText('protein'),
          ingredientCarbs: draftText('carbs'),
          ingredientFat: draftText('fat'),
           ingredientSugar: draftText('sugar'),
           ingredientServingSize: draftText('servingSize'),
           ingredientServingUnit: String(active.servingUnit ?? ''),
           ingredientServingVisible: !!active.servingSize || !!active.servingUnit,
          ingredientCostPer: CUR + (active.packageSize > 0 ? active.packagePrice / active.packageSize : 0).toFixed(active.packageSize > 0 && active.packagePrice / active.packageSize < 0.01 ? 4 : 2),
           ingredientScanLoading: this.state.ingredientScanLoading === true,
           ingredientScanError: this.state.ingredientScanError || '',
           ingredientScanComplete: this.state.ingredientScanComplete === true,
          ingredientSaveError: this.state.ingredientSaveError || '',
          ingredientExisting: !!activeKey,
          ingredientNew: !activeKey,
          ingredientDeleteOpen: this.state.ingredientDeleteOpen === true && !!activeKey,
          ingredientDeleteName: active.name,
          requestDeleteIngredient: () => this.setState({ ingredientDeleteOpen: true }),
          cancelDeleteIngredient: () => this.setState({ ingredientDeleteOpen: false }),
          confirmDeleteIngredient: () => { if (activeKey) deleteIngredient(activeKey); },
          setIngredientName: e => setDraft({ name: e.target.value.slice(0, 160) }),
          setIngredientSupplier: e => setDraft({ supplier: e.target.value.slice(0, 160) }),
          setIngredientPackagePrice: e => setDraft({ packagePrice: e.target.value }),
          setIngredientPackageSize: e => setDraft({ packageSize: e.target.value }),
          setIngredientUnit: e => setDraft({ unit: e.target.value }),
          setIngredientCategory: e => setDraft({ category: e.target.value }),
          setIngredientKcal: e => setDraft({ kcal: e.target.value }),
          setIngredientProtein: e => setDraft({ protein: e.target.value }),
          setIngredientCarbs: e => setDraft({ carbs: e.target.value }),
          setIngredientFat: e => setDraft({ fat: e.target.value }),
           setIngredientSugar: e => setDraft({ sugar: e.target.value }),
           setIngredientServingSize: e => setDraft({ servingSize: e.target.value }),
           setIngredientServingUnit: e => setDraft({ servingUnit: e.target.value.slice(0, 30) }),
           scanIngredientLabel: async e => {
             const file = e && e.target && e.target.files && e.target.files[0];
             if (e && e.target) e.target.value = '';
             if (!file) return;
             const request = (this.state.ingredientScanRequest || 0) + 1;
             this.setState({ ingredientScanRequest: request, ingredientScanLoading: true, ingredientScanError: '', ingredientScanComplete: false });
             try {
               const result = await window.__baketlyScanIngredientLabel(file);
               const detected = {
                 ...(result.productName ? { name: result.productName } : {}),
                 ...(result.packageSize !== null ? { packageSize: result.packageSize } : {}),
                 ...(result.packageUnit ? { unit: result.packageUnit.toLowerCase() } : {}),
                 ...(result.calories !== null ? { kcal: result.calories } : {}),
                 ...(result.protein_g !== null ? { protein: result.protein_g } : {}),
                 ...(result.carbohydrates_g !== null ? { carbs: result.carbohydrates_g } : {}),
                 ...(result.fat_g !== null ? { fat: result.fat_g } : {}),
                 ...(result.sugar_g !== null ? { sugar: result.sugar_g } : {}),
                 ...(result.servingSize !== null ? { servingSize: result.servingSize } : {}),
                 ...(result.servingUnit ? { servingUnit: result.servingUnit } : {})
               };
               this.setState(st => st.screen === 'ingredientEdit' && !st.activeIngredientKey && st.ingredientScanRequest === request ? { ingredientDraft: { ...(st.ingredientDraft || {}), ...detected }, ingredientScanLoading: false, ingredientScanError: '', ingredientScanComplete: true } : null);
             } catch (error) {
               this.setState(st => st.ingredientScanRequest === request ? { ingredientScanLoading: false, ingredientScanError: error && error.message ? error.message : 'I couldn’t read that label. Please enter the details manually.', ingredientScanComplete: false } : null);
             }
           },
           cancelIngredientEdit: () => this.setState(st => { const stack = [...st.stack]; const previous = stack.pop() || 'ingredients'; return { screen: previous, stack, activeIngredientKey: null, ingredientDraft: null, ingredientDeleteOpen: false, ingredientSaveError: '', ingredientScanRequest: (st.ingredientScanRequest || 0) + 1, ingredientScanLoading: false, ingredientScanError: '', ingredientScanComplete: false }; }),
          saveIngredient: () => {
            const key = activeKey || 'ingredient-' + Date.now().toString(36);
             const normalized = normalize(key, activeKey ? this.state.ingredientDraft : { ...blankIngredient, ...(this.state.ingredientDraft || {}) });
            if (!normalized.name.trim() || normalized.packageSize <= 0) {
              this.setState({ ingredientSaveError: normalized.name.trim() ? 'Package size must be greater than zero.' : 'Ingredient name is required.' });
              return;
            }
            this.setState(st => {
              const stack = [...st.stack];
              const previous = stack.pop() || 'ingredients';
              // record the old price so "See what changed" can report the move
              const before = (st.ingredientRecords || {})[key] || detailDefaults[key] || null;
              const priceHistory = { ...(st.priceHistory || {}) };
              if (before && (Number(before.packagePrice) !== normalized.packagePrice || Number(before.packageSize) !== normalized.packageSize)) {
                const previousSize = Math.max(0, Number(before.packageSize) || 0);
                const entry = {
                  at: new Date().toISOString(),
                  packagePrice: Math.max(0, Number(before.packagePrice) || 0),
                  packageSize: previousSize,
                  unit: String(before.unit || normalized.unit || 'g').slice(0, 10),
                  unitCost: previousSize > 0 ? (Math.max(0, Number(before.packagePrice) || 0)) / previousSize : 0
                };
                priceHistory[key] = [...(priceHistory[key] || []), entry].slice(-12);
              }
              return { ingredientRecords: { ...(st.ingredientRecords || {}), [key]: normalized }, priceHistory, screen: previous, stack, activeIngredientKey: null, ingredientDraft: null, ingredientDeleteOpen: false, ingredientSaveError: '' };
            });
          }
        };
      })(),`;

  const anchor = /([ \t]*)fromScan:\s*this\.state\.fromScan\s*===\s*true,\s*\n\s*ingTitle:/;
  if (!anchor.test(template)) {
    throw new Error("Missing stable ingredient controller anchor");
  }
  return template.replace(anchor, (_, indent: string) => `${controller}
${indent}fromScan: this.state.fromScan === true,
${indent}ingTitle:`);
}

/**
 * A turning ring, for the waits worth showing.
 *
 * Reading a label is a photo going to a model and back — several seconds in
 * which a line of text that never changes looks like nothing is happening.
 * The page had no animations at all, so the keyframes go in beside the rest
 * of its styles rather than in a style attribute, which cannot hold them.
 * `prefers-reduced-motion` stops it turning for anyone who asked for that.
 */
function addSpinnerStyle(template: string): string {
  const anchor = "    .bk-row:active{background:rgba(60,55,30,.05)}";
  if (!template.includes(anchor)) throw new Error("Missing stable style anchor");
  return template.replace(
    anchor,
    () =>
      anchor +
      "\n    @keyframes bk-spin{to{transform:rotate(360deg)}}" +
      "\n    .bk-spinner{display:inline-block;flex:none;width:16px;height:16px;border-radius:50%;" +
      "border:2px solid var(--color-accent-300);border-top-color:var(--color-accent);" +
      "animation:bk-spin .7s linear infinite}" +
      "\n    @media (prefers-reduced-motion:reduce){.bk-spinner{animation-duration:2.4s}}",
  );
}

export function applyIngredientRecordBehavior(template: string): string {
  return addSpinnerStyle(
    addIngredientController(
      replaceIngredientEditor(replaceIngredientList(addIngredientState(template))),
    ),
  );
}