const defaultRecipes = [
  {
    id: "sourdough-cheddar-loaf",
    name: "Sourdough Cheddar Loaf",
    type: "bread",
    icon: "loaf",
    price: 17,
    yield: 2,
    ingredientKeys: ["flour", "cheddar", "butter"],
    packagingKeys: ["breadbag", "sticker"],
    amounts: { flour: 850, cheddar: 150, butter: 35 },
  },
  {
    id: "sourdough-loaf-750g",
    name: "Sourdough Loaf 750g",
    type: "bread",
    icon: "loaf",
    price: 15,
    yield: 2,
    ingredientKeys: ["flour", "milk", "butter"],
    packagingKeys: ["breadbag", "sticker"],
    amounts: { flour: 900, milk: 560, butter: 20 },
  },
  {
    id: "mini-chocolate-babka",
    name: "Mini Chocolate Babka",
    type: "babka",
    icon: "babka",
    price: 10,
    yield: 12,
    ingredientKeys: ["flour", "butter", "choc", "milk", "eggs"],
    packagingKeys: ["babkabag", "sticker"],
    amounts: { flour: 500, butter: 200, choc: 250, milk: 250, eggs: 3 },
  },
  {
    id: "mini-nutella-babka",
    name: "Mini Nutella Babka",
    type: "babka",
    icon: "babka",
    price: 10,
    yield: 12,
    ingredientKeys: ["flour", "butter", "nutella", "milk", "eggs"],
    packagingKeys: ["babkabag", "sticker"],
    amounts: { flour: 500, butter: 180, nutella: 260, milk: 250, eggs: 3 },
  },
  {
    id: "focaccia-bread",
    name: "Focaccia Bread",
    type: "bread",
    icon: "focaccia",
    price: 10,
    yield: 2,
    ingredientKeys: ["flour", "butter", "milk"],
    packagingKeys: ["paperbag", "sticker"],
    amounts: { flour: 700, butter: 90, milk: 440 },
  },
  {
    id: "big-brookie",
    name: "Big Brookie",
    type: "cookie",
    icon: "brookie",
    price: 5,
    yield: 12,
    ingredientKeys: ["flour", "butter", "choc", "eggs"],
    packagingKeys: ["cookiewrap", "sticker"],
    amounts: { flour: 310, butter: 180, choc: 220, eggs: 2 },
  },
  {
    id: "big-chocolate-chip-cookie",
    name: "Big Chocolate Chip Cookie",
    type: "cookie",
    icon: "cookie",
    price: 4,
    yield: 12,
    ingredientKeys: ["flour", "butter", "choc", "eggs"],
    packagingKeys: ["cookiewrap", "sticker"],
    amounts: { flour: 280, butter: 150, choc: 180, eggs: 2 },
  },
  {
    id: "big-m-and-m-cookie",
    name: "Big M&M Cookie",
    type: "cookie",
    icon: "cookie",
    price: 4,
    yield: 12,
    ingredientKeys: ["flour", "butter", "whitechoc", "eggs"],
    packagingKeys: ["cookiewrap", "sticker"],
    amounts: { flour: 280, butter: 150, whitechoc: 180, eggs: 2 },
  },
  {
    id: "chocolate-cake-tainer",
    name: "Chocolate Cake-Tainer",
    type: "treat",
    icon: "cake",
    price: 12,
    yield: 6,
    ingredientKeys: ["flour", "butter", "choc", "eggs", "milk"],
    packagingKeys: ["caketainer", "sticker"],
    amounts: { flour: 300, butter: 180, choc: 280, eggs: 3, milk: 180 },
  },
  {
    id: "frosting-cup",
    name: "Frosting Cup",
    type: "treat",
    icon: "cup",
    price: 4,
    yield: 12,
    ingredientKeys: ["butter", "milk", "vanilla"],
    packagingKeys: ["frostingc", "sticker"],
    amounts: { butter: 300, milk: 100, vanilla: 12 },
  },
];

const blankRecipeSource =
  "{ name: '', type: 'treat', icon: 'cake', price: 0, yield: 12, ingredientKeys: [], packagingKeys: [], amounts: {} }";

const packagingDefaults = {
  babkabag: { name: "Mini babka bag", supplier: "Uline", packPrice: 11, unitsPerPack: 50 },
  breadbag: { name: "Bread bag", supplier: "Uline", packPrice: 17, unitsPerPack: 100 },
  caketainer: { name: "Cake-Tainer", supplier: "Amazon", packPrice: 8.5, unitsPerPack: 50 },
  frostingc: { name: "Frosting container", supplier: "Amazon", packPrice: 8.49, unitsPerPack: 50 },
  paperbag: { name: "Paper bag", supplier: "Costco", packPrice: 15.99, unitsPerPack: 100 },
  cookiewrap: { name: "Cookie wrap", supplier: "Uline", packPrice: 9.99, unitsPerPack: 500 },
  sticker: { name: "Product sticker", supplier: "Uline", packPrice: 12, unitsPerPack: 500, visible: false },
};

const packagingPickerMarkup = `<sc-if value="{{ packPickerOpen }}" hint-placeholder-val="{{ false }}">
<div sc-camel-on-click="{{ cancelPackPicker }}" style="position:fixed;inset:0;background:rgba(30,27,22,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:40">
  <div role="dialog" aria-modal="true" aria-label="Add packaging" style="width:min(100%,380px);max-height:78%;display:flex;flex-direction:column;background:var(--color-bg);border:1px solid var(--color-divider);border-radius:20px;padding:20px;box-shadow:var(--shadow-lg);box-sizing:border-box">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex:none"><h4>Add packaging</h4><button sc-camel-on-click="{{ closePackPicker }}" aria-label="Close packaging picker" style="width:30px;height:30px;border:0;background:transparent;color:var(--color-text);font-size:24px;line-height:1;cursor:pointer">×</button></div>
    <div style="background:#fff;border:1px solid var(--color-neutral-300);border-radius:14px;padding:0 12px;display:flex;align-items:center;gap:9px;margin-bottom:10px;flex:none">
      <input value="{{ packSearch }}" sc-camel-on-change="{{ setPackSearch }}" placeholder="Search packaging" aria-label="Search packaging" style="flex:1;border:0;outline:none;background:none;font-family:var(--font-body);font-size:13px;color:var(--color-text);padding:11px 0">
    </div>
    <div style="flex:1;overflow:auto;min-height:0;display:flex;flex-direction:column">
      <sc-for list="{{ packPickerItems }}" as="pp" hint-placeholder-count="4">
        <button class="bk-row" sc-camel-on-click="{{ pp.toggle }}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 4px;border:0;border-top:1px solid var(--color-divider);background:transparent;cursor:pointer;font-family:var(--font-body);font-size:14px;min-height:44px;box-sizing:border-box;text-align:left"><span>{{ pp.name }}</span><span style="display:flex;align-items:center;gap:10px"><span class="text-muted" style="font-feature-settings:'tnum';font-size:12px">{{ pp.meta }}</span><span aria-hidden="true" style="width:20px;height:20px;border:1px solid var(--color-accent);border-radius:6px;display:grid;place-items:center;color:var(--color-accent);font-weight:700">{{ pp.check }}</span></span></button>
      </sc-for>
      <sc-if value="{{ packPickerEmpty }}" hint-placeholder-val="{{ false }}"><div class="text-muted" style="padding:16px 4px;font-size:13px;text-align:center">No matching packaging.</div></sc-if>
    </div>
    <button class="btn btn-primary btn-block" sc-camel-on-click="{{ confirmPackPicker }}" style="margin-top:14px;min-height:44px">{{ packPickerConfirmLabel }}</button>
  </div>
</div>
</sc-if>`;

const packagingPickerFallbackMarkup = `<sc-if value="{{ packPickerOpen }}" hint-placeholder-val="{{ false }}">
<div style="position:fixed;inset:0;background:rgba(30,27,22,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:40">
  <div role="dialog" aria-modal="true" aria-label="Packaging unavailable" class="card" style="width:min(100%,340px);padding:22px;gap:12px"><h3 style="margin:0">Packaging is unavailable</h3><p class="text-muted" style="font-size:13px;margin:0">Close and reopen this recipe to try again.</p><button class="btn btn-primary btn-block" sc-camel-on-click="{{ togglePackPicker }}">Close</button></div>
</div>
</sc-if>`;

const packagingDeleteDialogMarkup = `<sc-if value="{{ packagingDeleteOpen }}" hint-placeholder-val="{{ false }}">
<div role="dialog" aria-modal="true" aria-label="Delete packaging confirmation" style="position:fixed;inset:0;z-index:40;background:rgba(30,27,22,.42);display:flex;align-items:center;justify-content:center;padding:20px">
  <div class="card" style="width:min(100%,340px);padding:22px;gap:12px"><h3 style="margin:0">Delete packaging?</h3><p class="text-muted" style="font-size:13px;margin:0">Delete {{ packagingDeleteName }}? It will also be removed from recipes that use it.</p><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px"><button class="btn btn-secondary" sc-camel-on-click="{{ cancelDeletePackaging }}">Cancel</button><button class="btn btn-primary" sc-camel-on-click="{{ confirmDeletePackaging }}" style="background:#b0563e;border-color:#b0563e">Delete</button></div></div>
</div>
</sc-if>`;

function replaceScopedConditional(
  template: string,
  stateName: string,
  replacement: string,
): string {
  const opening = `<sc-if value="{{ ${stateName} }}"`;
  const start = template.indexOf(opening);
  if (start === -1) {
    throw new Error(`Missing ${stateName} section`);
  }

  const conditionalTag = /<\/?sc-if\b[^>]*>/g;
  conditionalTag.lastIndex = start;
  let depth = 0;
  let end = -1;
  let match: RegExpExecArray | null;

  while ((match = conditionalTag.exec(template))) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      end = conditionalTag.lastIndex;
      break;
    }
  }

  if (end === -1) {
    throw new Error(`Unclosed ${stateName} section`);
  }

  return template.slice(0, start) + replacement + template.slice(end);
}

function hasBalancedConditionals(template: string): boolean {
  const tags = template.match(/<\/?sc-if\b[^>]*>/g) || [];
  let depth = 0;
  for (const tag of tags) {
    depth += tag.startsWith("</") ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function withoutUnresolvedPackagingTokens(template: string): string {
  return [
    "{{ pp.name }}",
    "{{ pp.meta }}",
    "{{ pp.check }}",
    "{{ packagingDeleteName }}",
    "{{ packagingName }}",
    "{{ packagingSupplier }}",
    "{{ packagingPackPrice }}",
    "{{ packagingUnitsPerPack }}",
    "{{ packagingCostPer }}",
  ].reduce((result, token) => result.replaceAll(token, ""), template);
}

function safelyApplyPackagingSection(
  label: string,
  template: string,
  transform: (value: string) => string,
  fallback?: (value: string) => string,
): string {
  try {
    const next = transform(template);
    if (!hasBalancedConditionals(next)) {
      throw new Error("Generated conditional tags are unbalanced");
    }
    return next;
  } catch (error) {
    console.error(`[Baketly] ${label} was skipped:`, error);
    return fallback ? fallback(template) : template;
  }
}

function usePackagingPickerFallback(template: string): string {
  const safeTemplate = withoutUnresolvedPackagingTokens(template);
  try {
    return replaceScopedConditional(
      safeTemplate,
      "packPickerOpen",
      packagingPickerFallbackMarkup,
    );
  } catch {
    return safeTemplate;
  }
}

const packagingListMarkup = `<sc-if value="{{ pantryOnPack }}" hint-placeholder-val="{{ false }}">
  <div style="display:flex;flex-direction:column;border-bottom:1px solid var(--color-divider)">
    <sc-for list="{{ packagingItems }}" as="item" hint-placeholder-count="6">
      <div class="bk-row" sc-camel-on-click="{{ item.open }}" style="display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--color-divider);cursor:pointer">
        <span style="width:46px;height:46px;border-radius:12px;background:#fff;border:1px solid var(--color-divider);display:grid;place-items:center;color:var(--color-accent);font-family:var(--font-heading);font-weight:700;font-size:18px;flex:none;overflow:hidden;position:relative"><span>{{ item.initial }}</span>{{ item.photoEl }}</span>
        <div style="flex:1;min-width:0"><div style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ item.name }}</div><div class="text-muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ item.packageLine }}</div></div>
        <div style="text-align:right;font-feature-settings:'tnum';font-size:14px;flex:none">{{ item.costLine }}</div>
      </div>
    </sc-for>
  </div>
  </sc-if>`;

const packagingEditorMarkup = `<!-- ══ ADD / EDIT PACKAGING ══ -->
<sc-if value="{{ onPackagingEdit }}" hint-placeholder-val="{{ false }}">
<div style="padding:14px 20px 28px">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><button class="btn btn-ghost" sc-camel-on-click="{{ cancelPackagingEdit }}" style="margin-left:-6px;min-height:44px">‹ Packaging</button><sc-if value="{{ packagingExisting }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ requestDeletePackaging }}" style="min-height:44px;color:#b0563e">Delete</button></sc-if></div>
  <div class="field" style="margin:6px 0 12px"><label>Packaging name</label><input class="input" value="{{ packagingName }}" sc-camel-on-change="{{ setPackagingName }}" placeholder="Name your packaging" aria-label="Packaging name" style="font-family:var(--font-heading);font-weight:600;font-size:22px;padding:10px 12px"></div>
  <p class="text-muted" style="font-size:13px;margin-bottom:18px">Priced per unit, added to each product's cost.</p>
  <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--color-divider);border-radius:14px;background:#fff;margin-bottom:18px">
    <div style="width:58px;height:58px;border-radius:12px;background:var(--color-neutral-100);display:grid;place-items:center;overflow:hidden;flex:none;color:var(--color-accent);font-family:var(--font-heading);font-size:19px;font-weight:700;position:relative"><span>{{ packagingInitial }}</span>{{ packagingPhotoEl }}</div>
    <div style="min-width:0;flex:1"><div style="font-weight:600;font-size:14px;margin-bottom:5px">Packaging photo</div><div class="text-muted" style="font-size:12px">Use the camera or choose an image.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px"><label class="btn btn-secondary" style="min-height:36px;font-size:12px;position:relative;overflow:hidden;cursor:pointer">Take photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" sc-camel-on-change="{{ setPackagingPhoto }}" aria-label="Take packaging photo" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label><label class="btn btn-secondary" style="min-height:36px;font-size:12px;position:relative;overflow:hidden;cursor:pointer">Upload image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" sc-camel-on-change="{{ setPackagingPhoto }}" aria-label="Upload packaging photo" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label><sc-if value="{{ packagingHasPhoto }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ removePackagingPhoto }}" style="min-height:36px;font-size:12px;color:#b0563e">Remove</button></sc-if></div><sc-if value="{{ packagingPhotoUploading }}" hint-placeholder-val="{{ false }}"><div class="text-muted" style="font-size:12px;margin-top:7px">Uploading photo…</div></sc-if><sc-if value="{{ packagingPhotoError }}" hint-placeholder-val=""><div style="color:#b0563e;font-size:12px;margin-top:7px">{{ packagingPhotoError }}</div></sc-if></div>
  </div>
  <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px">
    <div class="field"><label>Supplier</label><input class="input" value="{{ packagingSupplier }}" sc-camel-on-change="{{ setPackagingSupplier }}" placeholder="e.g. Uline" aria-label="Packaging supplier"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field"><label>Pack price</label><input class="input" value="{{ packagingPackPrice }}" sc-camel-on-change="{{ setPackagingPackPrice }}" inputmode="decimal" aria-label="Pack price" style="font-feature-settings:'tnum'"></div>
      <div class="field"><label>Units per pack</label><input class="input" value="{{ packagingUnitsPerPack }}" sc-camel-on-change="{{ setPackagingUnitsPerPack }}" inputmode="decimal" aria-label="Units per pack" style="font-feature-settings:'tnum'"></div>
    </div>
  </div>
  <div class="card" style="gap:6px;margin-bottom:8px"><span class="card-kicker">Cost per unit</span><div style="font-family:var(--font-heading);font-weight:600;font-size:26px;font-feature-settings:'tnum'">{{ packagingCostPer }}</div></div>
  <div class="text-muted" style="font-size:12px;margin-bottom:20px">Calculated automatically · pick it in any recipe's packaging list</div>
  <sc-if value="{{ packagingSaveError }}" hint-placeholder-val=""><div style="color:#b0563e;font-size:12px;margin-bottom:10px">{{ packagingSaveError }}</div></sc-if>
  <button class="btn btn-primary btn-block" sc-camel-on-click="{{ savePackaging }}" style="min-height:48px">{{ packagingSaveLabel }}</button>
  <sc-if value="{{ packagingDeleteOpen }}" hint-placeholder-val="{{ false }}"><div role="dialog" aria-modal="true" aria-label="Delete packaging confirmation" style="position:fixed;inset:0;z-index:40;background:rgba(30,27,22,.42);display:flex;align-items:center;justify-content:center;padding:20px"><div class="card" style="width:min(100%,340px);padding:22px;gap:12px"><h3 style="margin:0">Delete packaging?</h3><p class="text-muted" style="font-size:13px;margin:0">Delete {{ packagingDeleteName }}? It will also be removed from recipes that use it.</p><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px"><button class="btn btn-secondary" sc-camel-on-click="{{ cancelDeletePackaging }}">Cancel</button><button class="btn btn-primary" sc-camel-on-click="{{ confirmDeletePackaging }}" style="background:#b0563e;border-color:#b0563e">Delete</button></div></div></div></sc-if>
</div>
</sc-if>`;

function addRecipeState(template: string): string {
  return template.replace(
    "recipeAmts: { flour: 500, butter: 200, choc: 250, milk: 250, eggs: 3 },\n    evQty:",
    `recipeAmts: { flour: 500, butter: 200, choc: 250, milk: 250, eggs: 3 },
     recipeRecords: ${JSON.stringify(defaultRecipes)},
     activeRecipeId: 'mini-chocolate-babka', recipeDraft: null,
     packagingRecords: {},
      removedPackagingKeys: [],
    evQty:`,
  );
}

function replacePackagingList(template: string): string {
  return template.replace(
    /<sc-if value="\{\{ pantryOnPack \}\}"[\s\S]*?<\/sc-if>\n<\/div>\n<\/sc-if>/,
    // The matched range includes the Pantry screen's closing div and sc-if.
    // Restore them after replacing just the packaging section.
    () => `${packagingListMarkup}
</div>
</sc-if>`,
  );
}

function replacePackagingEditor(template: string): string {
  return template.replace(
    /<!-- ══ ADD \/ EDIT PACKAGING ══ -->[\s\S]*?<!-- ══ MARKETS ══ -->/,
    () => packagingEditorMarkup + "\n\n<!-- ══ MARKETS ══ -->",
  );
}

function replacePackagingPicker(template: string): string {
  return replaceScopedConditional(template, "packPickerOpen", packagingPickerMarkup);
}

function replacePackagingDeleteDialog(template: string): string {
  return replaceScopedConditional(
    template,
    "packagingDeleteOpen",
    packagingDeleteDialogMarkup,
  );
}

function addPackagingController(template: string): string {
  const defaults = JSON.stringify(packagingDefaults);
  const controller = `      ...(() => {
        const defaults = ${defaults};
        this.PACK_META = this.PACK_META || {};
        const saved = this.state.packagingRecords || {};
        const removedPackagingKeys = new Set(this.state.removedPackagingKeys || []);
        const keys = [...new Set([...Object.keys(defaults), ...Object.keys(this.PACK_META || {}), ...Object.keys(saved)])].filter(key => !removedPackagingKeys.has(key));
        const normalize = (key, draft) => {
          const base = defaults[key] || { name: (this.PACK_META[key] && this.PACK_META[key].name) || key, supplier: '', packPrice: 0, unitsPerPack: 1 };
          const source = { ...base, ...(saved[key] || {}), ...(draft || {}) };
           return { name: String(source.name || key || 'Unnamed packaging').slice(0, 160), supplier: String(source.supplier || '').slice(0, 160), packPrice: Math.max(0, Number(source.packPrice) || 0), unitsPerPack: Math.max(0, Number(source.unitsPerPack) || 0), photoPath: typeof source.photoPath === 'string' ? source.photoPath.slice(0, 300) : '' };
        };
        keys.forEach(key => { const item = normalize(key); this.PACK_META[key] = { ...this.PACK_META[key], name: item.name, per: item.unitsPerPack > 0 ? item.packPrice / item.unitsPerPack : 0 }; });
        const activeKey = this.state.activePackagingKey || null;
        const active = activeKey ? normalize(activeKey, this.state.packagingDraft) : { name: '', supplier: '', packPrice: 0, unitsPerPack: 1, photoPath: '', ...(this.state.packagingDraft || {}) };
        // See ingredient-template.ts: normalize() coerces with Number(), which would
        // strip an in-progress decimal point out of the input on every keystroke.
        const draftText = field => { const draft = this.state.packagingDraft; return draft && typeof draft[field] === 'string' ? draft[field] : String(active[field] ?? ''); };
        const setDraft = update => this.setState(st => ({ packagingDraft: { ...active, ...(st.packagingDraft || {}), ...update }, packagingSaveError: '' }));
        const deletePackaging = key => this.setState(st => {
          const packagingRecords = { ...(st.packagingRecords || {}) };
          delete packagingRecords[key];
          const stack = [...st.stack];
          const previous = stack.pop() || 'ingredients';
          return { packagingRecords, removedPackagingKeys: [...new Set([...(st.removedPackagingKeys || []), key])], recipeRecords: (st.recipeRecords || []).map(recipe => ({ ...recipe, packagingKeys: (recipe.packagingKeys || []).filter(packagingKey => packagingKey !== key) })), screen: previous, stack, activePackagingKey: null, packagingDraft: null, packagingDeleteOpen: false, packagingSaveError: '' };
        });
        return {
          packagingItems: keys.filter(key => defaults[key]?.visible !== false).map(key => {
            const item = normalize(key); const per = item.unitsPerPack > 0 ? item.packPrice / item.unitsPerPack : 0;
             return { key, name: item.name || 'Unnamed packaging', initial: (item.name || 'P').slice(0, 1).toUpperCase(), photoEl: (() => { const photoUrl = window.__baketlyPhotoUrl(item.photoPath); return photoUrl && !(this.state.packagingPhotoFailures || {})[item.photoPath] ? React.createElement('img', { src: photoUrl, alt: '', onError: () => this.setState(st => ({ packagingPhotoFailures: { ...(st.packagingPhotoFailures || {}), [item.photoPath]: true } })), style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#fff' } }) : null; })(), packageLine: (item.supplier || 'No supplier') + ' · $' + item.packPrice.toFixed(2) + ' / ' + item.unitsPerPack + ' pcs', costLine: '$' + per.toFixed(2) + '/pc', open: () => this.setState(st => ({ screen: 'packagingEdit', stack: [...st.stack, st.screen], activePackagingKey: key, packagingDraft: normalize(key), packagingDeleteOpen: false, packagingSaveError: '', packagingPhotoError: '', packagingPhotoUploading: false, packagingPhotoRequest: (st.packagingPhotoRequest || 0) + 1 })), remove: () => deletePackaging(key) };
          }),
          packagingTitle: activeKey ? 'Edit packaging' : 'New packaging',
          packagingName: active.name, packagingSupplier: active.supplier, packagingPackPrice: draftText('packPrice'), packagingUnitsPerPack: draftText('unitsPerPack'),
          packagingCostPer: '$' + (active.unitsPerPack > 0 ? active.packPrice / active.unitsPerPack : 0).toFixed(2),
           packagingInitial: (active.name || 'P').slice(0, 1).toUpperCase(),
           packagingHasPhoto: !!window.__baketlyPhotoUrl(active.photoPath) && !(this.state.packagingPhotoFailures || {})[active.photoPath],
           packagingPhotoEl: (() => { const photoUrl = window.__baketlyPhotoUrl(active.photoPath); return photoUrl && !(this.state.packagingPhotoFailures || {})[active.photoPath] ? React.createElement('img', { src: photoUrl, alt: 'Packaging photo', onError: () => this.setState(st => ({ packagingPhotoFailures: { ...(st.packagingPhotoFailures || {}), [active.photoPath]: true } })), style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#fff' } }) : null; })(),
           packagingPhotoUploading: this.state.packagingPhotoUploading === true,
           packagingPhotoError: this.state.packagingPhotoError || '',
          packagingSaveLabel: activeKey ? 'Save changes' : 'Save packaging',
          packagingSaveError: this.state.packagingSaveError || '',
          packagingExisting: !!activeKey,
          packagingDeleteOpen: this.state.packagingDeleteOpen === true && !!activeKey,
          packagingDeleteName: active.name || 'this packaging item',
          requestDeletePackaging: () => this.setState({ packagingDeleteOpen: true }),
          cancelDeletePackaging: () => this.setState({ packagingDeleteOpen: false }),
          confirmDeletePackaging: () => { if (activeKey) deletePackaging(activeKey); },
          setPackagingName: e => setDraft({ name: e.target.value }),
          setPackagingSupplier: e => setDraft({ supplier: e.target.value }),
          setPackagingPackPrice: e => setDraft({ packPrice: e.target.value }),
          setPackagingUnitsPerPack: e => setDraft({ unitsPerPack: e.target.value }),
           hidePackagingPhoto: () => this.setState(st => ({ packagingPhotoFailures: { ...(st.packagingPhotoFailures || {}), [active.photoPath]: true } })),
           removePackagingPhoto: () => this.setState(st => ({ packagingDraft: { ...active, ...(st.packagingDraft || {}), photoPath: '' }, packagingPhotoError: '', packagingPhotoRequest: (st.packagingPhotoRequest || 0) + 1 })),
           setPackagingPhoto: async e => {
             const file = e && e.target && e.target.files && e.target.files[0];
             if (e && e.target) e.target.value = '';
             if (!file) return;
             const request = (this.state.packagingPhotoRequest || 0) + 1;
             this.setState({ packagingPhotoRequest: request, packagingPhotoUploading: true, packagingPhotoError: '' });
             try {
               const photoPath = await window.__baketlyUploadPhoto(file);
               this.setState(st => st.screen === 'packagingEdit' && st.activePackagingKey === activeKey && st.packagingPhotoRequest === request ? { packagingDraft: { ...active, ...(st.packagingDraft || {}), photoPath }, packagingPhotoUploading: false, packagingPhotoError: '' } : null);
             } catch (error) {
               this.setState(st => st.screen === 'packagingEdit' && st.activePackagingKey === activeKey && st.packagingPhotoRequest === request ? { packagingPhotoUploading: false, packagingPhotoError: error && error.message ? error.message : 'Could not upload the photo.' } : null);
             }
           },
           cancelPackagingEdit: () => this.setState(st => { const stack = [...st.stack]; const previous = stack.pop() || 'ingredients'; return { screen: previous, stack, activePackagingKey: null, packagingDraft: null, packagingDeleteOpen: false, packagingSaveError: '', packagingPhotoError: '', packagingPhotoUploading: false, packagingPhotoRequest: (st.packagingPhotoRequest || 0) + 1 }; }),
          savePackaging: () => {
             if (this.state.packagingPhotoUploading) { this.setState({ packagingSaveError: 'Wait for the photo upload to finish.' }); return; }
            const key = activeKey || 'pack-' + Date.now().toString(36);
            const normalized = normalize(key, this.state.packagingDraft);
            if (!normalized.name.trim() || normalized.unitsPerPack <= 0) { this.setState({ packagingSaveError: normalized.name.trim() ? 'Units per pack must be greater than zero.' : 'Packaging name is required.' }); return; }
            this.setState(st => { const stack = [...st.stack]; const previous = stack.pop() || 'ingredients'; return { packagingRecords: { ...(st.packagingRecords || {}), [key]: normalized }, screen: previous, stack, activePackagingKey: null, packagingDraft: null, packagingDeleteOpen: false, packagingSaveError: '' }; });
          }
        };
      })(),`;
  const anchor = /([ \t]*)fromScan:\s*this\.state\.fromScan\s*===\s*true,\s*\n\s*ingTitle:/;
  if (!anchor.test(template)) {
    throw new Error("Missing stable packaging controller anchor");
  }
  return template.replace(anchor, (_, indent: string) => `${controller}
${indent}fromScan: this.state.fromScan === true,
${indent}ingTitle:`);
}

function replaceRecipeList(template: string): string {
  return template
    .replace(
      /        let list = this\.RECIPES[\s\S]*?        const recFilters =/,
      () => `        const records = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const recipeUnitCost = r => {
          const yieldCount = Math.max(1, Number(r.yield) || 1);
          const ingredientCost = (r.ingredientKeys || []).reduce((sum, key) => sum + (Number((r.amounts || {})[key]) || 0) * (this.ING_META[key] ? this.ING_META[key].per : 0), 0);
          const packagingCost = (r.packagingKeys || []).reduce((sum, key) => sum + (this.PACK_META[key] ? this.PACK_META[key].per : 0), 0);
          return ingredientCost / yieldCount + packagingCost;
        };
        let list = records.filter(r => rf === 'all' || r.type === rf);
        if (rs === 'az') list = [...list].sort((x, y) => x.name.localeCompare(y.name));
        if (rs === 'price') list = [...list].sort((x, y) => y.price - x.price);
        const recipeList = list.map(r => {
          const cost = recipeUnitCost(r);
          return {
            name: r.name, sell: '$' + Number(r.price).toFixed(2),
            costLine: 'costs $' + cost.toFixed(2),
            tag: cost < r.price * 0.35 ? 'healthy' : 'review price',
            tagCls: cost < r.price * 0.35 ? 'tag-neutral' : 'tag-accent',
            slot: 'rc-' + r.id,
            iconEl: React.createElement('span', { style: { display: 'grid' }, dangerouslySetInnerHTML: { __html: this.REC_ICONS[r.icon] } }),
            open: () => this.setState(st => ({ screen: 'recipeEditor', stack: [...st.stack, st.screen], activeRecipeId: r.id, recipeDraft: null, recipeDeleteOpen: false, ingPickerOpen: false, packPickerOpen: false }))
          };
        });
        const ingredientCount = [...new Set([...Object.keys(this.ING_META || {}), ...Object.keys(this.state.ingredientRecords || {})])].filter(key => !(this.state.removedIngredientKeys || []).includes(key)).length;
        const packagingCount = Object.keys(this.PACK_META || {}).filter(key => key !== 'sticker' && !(this.state.removedPackagingKeys || []).includes(key)).length;
        const recFilters =`,
    )
    .replace(
      /pantrySubtitle: pt === 'pack' \? '6 packaging items · priced per unit from the pack price\.' : \(pt === 'rec' \? '[^']*' : '43 ingredients · Baketly turns package prices into unit costs\.'\)/,
      "pantrySubtitle: pt === 'pack' ? packagingCount + ' packaging item' + (packagingCount === 1 ? '' : 's') + ' · priced per unit from the pack price.' : (pt === 'rec' ? records.length + ' recipe' + (records.length === 1 ? '' : 's') + ' · costs update as pantry prices change.' : ingredientCount + ' ingredient' + (ingredientCount === 1 ? '' : 's') + ' · Baketly turns package prices into unit costs.')",
    );
}

function replaceRecipeEditorLogic(template: string): string {
  const editorLogic = `      ...(() => {
        const records = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const blankRecipe = ${blankRecipeSource};
        const isNewRecipe = !this.state.activeRecipeId;
        const recipe = isNewRecipe
          ? { ...blankRecipe, ...(this.state.recipeDraft || {}) }
          : (records.find(r => r.id === this.state.activeRecipeId) || records[0] || blankRecipe);
        const keys = recipe.ingredientKeys || [];
        const packs = recipe.packagingKeys || [];
        const amounts = recipe.amounts || {};
        const y = Math.max(1, parseInt(recipe.yield, 10) || 1);
        const amt = k => amounts[k] ?? 0;
        const ingTotal = keys.reduce((sum, key) => sum + amt(key) * (this.ING_META[key] ? this.ING_META[key].per : 0), 0);
        const packPer = packs.reduce((sum, key) => sum + (this.PACK_META[key] ? this.PACK_META[key].per : 0), 0);
        const per = ingTotal / y + packPer;
        const updateRecipe = update => this.setState(st => {
          if (!st.activeRecipeId) return { recipeDraft: { ...blankRecipe, ...(st.recipeDraft || {}), ...update }, recipeSaveError: '' };
          return { recipeRecords: (st.recipeRecords || []).map(r => r.id === st.activeRecipeId ? { ...r, ...update } : r) };
        });
        const deleteRecipe = () => {
          if (!this.state.activeRecipeId) return;
          const id = this.state.activeRecipeId;
          this.setState(st => ({ recipeRecords: (st.recipeRecords || []).filter(recipe => recipe.id !== id), activeRecipeId: null, recipeDraft: null, recipeDeleteOpen: false, screen: 'ingredients', pantryTab: 'rec', stack: [], recipeSaveError: '' }));
        };
        return {
          recipeTitle: recipe.name,
          setRecipeTitle: e => updateRecipe({ name: e.target.value.slice(0, 160) }),
          recipeYield: String(y),
          setRecipeYield: e => { const value = parseInt(e.target.value, 10); updateRecipe({ yield: isNaN(value) || value < 1 ? 1 : value }); },
          recipeIngs: keys.map(k => {
            const m = this.ING_META[k];
            return {
              name: m.name, unit: m.unit, amt: String(amt(k)), costStr: '$' + (amt(k) * m.per).toFixed(2),
              set: e => { const value = parseFloat(e.target.value); updateRecipe({ amounts: { ...amounts, [k]: isNaN(value) || value < 0 ? 0 : value } }); },
              remove: () => updateRecipe({ ingredientKeys: keys.filter(x => x !== k) })
            };
          }),
          ingPickerOpen: this.state.ingPickerOpen === true,
          toggleIngPicker: () => this.setState(st => ({ ingPickerOpen: !st.ingPickerOpen, ingSearch: '', ingPickerSelected: [] })),
          cancelIngPicker: e => { if (!e || e.target === e.currentTarget) this.setState({ ingPickerOpen: false, ingSearch: '', ingPickerSelected: [] }); },
          closeIngPicker: () => this.setState({ ingPickerOpen: false, ingSearch: '', ingPickerSelected: [] }),
          ingSearch: this.state.ingSearch || '',
          setIngSearch: e => this.setState({ ingSearch: e.target.value }),
          confirmIngPicker: () => {
            const selected = this.state.ingPickerSelected || [];
            const nextAmounts = { ...amounts };
            selected.forEach(k => { if (nextAmounts[k] == null) nextAmounts[k] = this.ING_META[k].unit ? 100 : 1; });
            updateRecipe({ ingredientKeys: [...keys, ...selected.filter(k => !keys.includes(k))], amounts: nextAmounts });
            this.setState({ ingPickerOpen: false, ingSearch: '', ingPickerSelected: [] });
          },
          ...(() => {
            const query = (this.state.ingSearch || '').toLowerCase();
            const selected = this.state.ingPickerSelected || [];
            const available = Object.keys(this.ING_META).filter(k => !keys.includes(k) && (!query || this.ING_META[k].name.toLowerCase().includes(query)));
            return {
              ingPickerItems: available.map(k => {
                const m = this.ING_META[k];
                return {
                  name: m.name, meta: '$' + m.per.toFixed(m.per < 0.05 ? 4 : 2) + '/' + (m.unit || 'unit'), check: selected.includes(k) ? '✓' : '',
                  toggle: () => this.setState(st => ({ ingPickerSelected: (st.ingPickerSelected || []).includes(k) ? (st.ingPickerSelected || []).filter(x => x !== k) : [...(st.ingPickerSelected || []), k] }))
                };
              }),
              ingPickerEmpty: available.length === 0,
              ingPickerConfirmLabel: selected.length ? 'Add ' + selected.length + ' ingredient' + (selected.length === 1 ? '' : 's') : 'Select ingredients'
            };
          })(),
          recipePacks: packs.map(k => ({
            label: this.PACK_META[k].name + ' $' + this.PACK_META[k].per.toFixed(2),
            remove: e => { if (e && e.stopPropagation) e.stopPropagation(); updateRecipe({ packagingKeys: packs.filter(x => x !== k) }); }
          })),
          packPickerOpen: this.state.packPickerOpen === true,
          togglePackPicker: () => this.setState(st => ({ packPickerOpen: !st.packPickerOpen, packSearch: '', packPickerSelected: [] })),
          cancelPackPicker: e => { if (!e || e.target === e.currentTarget) this.setState({ packPickerOpen: false, packSearch: '', packPickerSelected: [] }); },
          closePackPicker: () => this.setState({ packPickerOpen: false, packSearch: '', packPickerSelected: [] }),
          packSearch: this.state.packSearch || '',
          setPackSearch: e => this.setState({ packSearch: e.target.value }),
          confirmPackPicker: () => {
            const selected = this.state.packPickerSelected || [];
            updateRecipe({ packagingKeys: [...packs, ...selected.filter(k => !packs.includes(k))] });
            this.setState({ packPickerOpen: false, packSearch: '', packPickerSelected: [] });
          },
          ...(() => {
            const query = (this.state.packSearch || '').toLowerCase();
            const selected = this.state.packPickerSelected || [];
            const available = Object.keys(this.PACK_META).filter(k => !packs.includes(k) && (!query || this.PACK_META[k].name.toLowerCase().includes(query)));
            return {
              packPickerItems: available.map(k => ({
                name: this.PACK_META[k].name, meta: '$' + this.PACK_META[k].per.toFixed(2) + '/unit', check: selected.includes(k) ? '✓' : '',
                toggle: () => this.setState(st => ({ packPickerSelected: (st.packPickerSelected || []).includes(k) ? (st.packPickerSelected || []).filter(x => x !== k) : [...(st.packPickerSelected || []), k] }))
              })),
              packPickerEmpty: available.length === 0,
              packPickerConfirmLabel: selected.length ? 'Add ' + selected.length + ' item' + (selected.length === 1 ? '' : 's') : 'Select packaging'
            };
          })(),
          newRecipeMode: isNewRecipe,
          existingRecipeMode: !isNewRecipe,
          recipeSell: '$' + Number(recipe.price || 0).toFixed(2),
          recipeSellInput: Number(recipe.price || 0).toFixed(2),
          setRecipeSell: e => { const value = parseFloat(e.target.value); updateRecipe({ price: isNaN(value) || value < 0 ? 0 : value }); },
          recipeCostPer: '$' + per.toFixed(2),
          recipeBatch: '$' + (ingTotal + packPer * y).toFixed(2),
          recipeMargin: Math.round((Number(recipe.price || 0) - per) / Math.max(Number(recipe.price || 0), 1) * 100) + '%',
          macroKcal: keys.length ? '402' : '0',
          macroProtein: keys.length ? '9g' : '0g',
          macroCarbs: keys.length ? '45g' : '0g',
          macroFat: keys.length ? '22g' : '0g',
          macroNote: keys.length ? 'Computed from your recipe ingredients.' : 'Add ingredients to calculate nutrition.',
          recipeSaveError: this.state.recipeSaveError || '',
          saveRecipeLabel: isNewRecipe ? 'Save recipe' : 'Done',
          recipeDeleteOpen: this.state.recipeDeleteOpen === true && !isNewRecipe,
          requestDeleteRecipe: () => this.setState({ recipeDeleteOpen: true }),
          cancelDeleteRecipe: () => this.setState({ recipeDeleteOpen: false }),
          confirmDeleteRecipe: deleteRecipe,
          saveRecipe: () => {
            if (!isNewRecipe) {
              this.setState({ screen: 'ingredients', pantryTab: 'rec', stack: [], recipeSaveError: '' });
              return;
            }
            const name = recipe.name.trim();
            if (!name) {
              this.setState({ recipeSaveError: 'Enter a recipe name before saving.' });
              return;
            }
            const id = 'recipe-' + Date.now().toString(36);
            this.setState(st => ({
              recipeRecords: [...(st.recipeRecords || []), { ...recipe, id, name }],
                activeRecipeId: id, recipeDraft: null, recipeDeleteOpen: false, screen: 'ingredients', pantryTab: 'rec', stack: [], recipeSaveError: ''
            }));
          }
        };
      })(),
      onChat`;

  return template.replace(
    /      \.\.\.\(\(\) => \{\n        const isNewRecipe = this\.state\.recipeIsNew[\s\S]*?\n      \}\)\(\),\n      onChat/,
    () => editorLogic,
  );
}

function replaceRecipeNavigation(template: string): string {
  return template
    .replace(
      /          pantryAdd: pt === 'pack' \? mk\('packagingEdit'\) : \(pt === 'rec' \? [\s\S]*?\),\n          pantryAddLabel:/,
       `          pantryAdd: pt === 'pack' ? () => this.setState(st => ({ screen: 'packagingEdit', stack: [...st.stack, st.screen], activePackagingKey: null, packagingDraft: null, packagingSaveError: '' })) : (pt === 'rec' ? () => this.setState(st => ({ screen: 'recipeEditor', stack: [...st.stack, st.screen], activeRecipeId: null, recipeDraft: ${blankRecipeSource}, recipeDeleteOpen: false, ingPickerOpen: false, packPickerOpen: false, recipeSaveError: '' })) : () => this.setState(st => ({ screen: 'ingredientEdit', stack: [...st.stack, st.screen], activeIngredientKey: null, ingredientDraft: { name: '', supplier: '', packagePrice: 0, packageSize: 0, unit: 'g', kcal: 0, protein: 0, carbs: 0, fat: 0 }, ingredientSaveError: '', fromScan: false }))),
          pantryAddLabel:`,
    )
    .replace(
      /      goRecipeEditor: [\s\S]*?\n      onAnalytics:/,
      `      goRecipeEditor: () => this.setState(st => ({ screen: 'recipeEditor', stack: [...st.stack, st.screen], activeRecipeId: st.activeRecipeId || 'mini-chocolate-babka', recipeDraft: null, ingPickerOpen: false, packPickerOpen: false })),
      goNewRecipe: () => this.setState(st => ({ screen: 'recipeEditor', stack: [...st.stack, st.screen], activeRecipeId: null, recipeDraft: ${blankRecipeSource}, ingPickerOpen: false, packPickerOpen: false, recipeSaveError: '' })),
      onAnalytics:`,
    );
}

function replaceRecipeEditorMarkup(template: string): string {
  return template
    .replace(
      '<div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="font-size:28px;margin:6px 0 2px">{{ recipeTitle }}</h2></div>',
      '<div class="field" style="margin:6px 0 12px"><label>Recipe name</label><input class="input" value="{{ recipeTitle }}" sc-camel-on-change="{{ setRecipeTitle }}" placeholder="Name your recipe" aria-label="Recipe name" style="font-family:var(--font-heading);font-weight:600;font-size:22px;padding:10px 12px"></div>',
    )
    .replace(
      '<button class="btn btn-ghost" sc-camel-on-click="{{ back }}" style="margin-left:-6px;min-height:44px">‹ Recipes</button>',
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><button class="btn btn-ghost" sc-camel-on-click="{{ back }}" style="margin-left:-6px;min-height:44px">‹ Recipes</button><sc-if value="{{ existingRecipeMode }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ requestDeleteRecipe }}" style="min-height:44px;color:#b0563e">Delete</button></sc-if></div>',
    )
    .replace(
      '<span style="flex:none;font-size:14px;font-weight:600;font-feature-settings:\'tnum\'">{{ r.sell }}</span>',
      '<span style="flex:none;font-size:14px;font-weight:600;font-feature-settings:\'tnum\'">{{ r.sell }}</span>',
    )
    .replace(
      '<span class="tag {{ r.tagCls }}" style="flex:none;font-size:10px;padding:2px 8px">{{ r.tag }}</span>',
      '',
    )
    .replace(
      '<div style="padding:14px 16px"><div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Sells today</div><sc-if value="{{ newRecipeMode }}" hint-placeholder-val="{{ false }}"><div style="display:flex;align-items:center;gap:3px;font-family:var(--font-heading);font-weight:600;font-size:26px"><span>$</span><input class="input" value="{{ recipeSellInput }}" sc-camel-on-change="{{ setRecipeSell }}" inputmode="decimal" aria-label="Selling price" style="width:82px;padding:3px 4px;font:inherit;text-align:right;border-radius:8px"></div></sc-if><sc-if value="{{ existingRecipeMode }}" hint-placeholder-val="{{ true }}"><div style="font-family:var(--font-heading);font-weight:600;font-size:26px;font-feature-settings:\'tnum\'">{{ recipeSell }}</div></sc-if></div>',
      '<div style="padding:14px 16px"><div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Sells for</div><div style="display:flex;align-items:center;gap:3px;font-family:var(--font-heading);font-weight:600;font-size:26px"><span>$</span><input class="input" value="{{ recipeSellInput }}" sc-camel-on-change="{{ setRecipeSell }}" inputmode="decimal" aria-label="Selling price" style="width:82px;padding:3px 4px;font:inherit;text-align:right;border-radius:8px"></div></div>',
    )
    .replace(
      '<div class="text-muted" style="font-size:12px;margin-top:6px">Margin = what you keep of the {{ recipeSell }} price after ingredients and packaging.</div>',
      '<div class="text-muted" style="font-size:12px;margin-top:6px">Margin = what you keep of the {{ recipeSell }} price after ingredients and packaging.</div><sc-if value="{{ recipeSaveError }}" hint-placeholder-val=""><div style="color:#b0563e;font-size:12px;margin-top:10px">{{ recipeSaveError }}</div></sc-if><button class="btn btn-primary btn-block" sc-camel-on-click="{{ saveRecipe }}" style="margin-top:16px;min-height:48px">{{ saveRecipeLabel }}</button><sc-if value="{{ recipeDeleteOpen }}" hint-placeholder-val="{{ false }}"><div role="dialog" aria-modal="true" aria-label="Delete recipe confirmation" style="position:fixed;inset:0;z-index:40;background:rgba(30,27,22,.42);display:flex;align-items:center;justify-content:center;padding:20px"><div class="card" style="width:min(100%,340px);padding:22px;gap:12px"><h3 style="margin:0">Delete recipe?</h3><p class="text-muted" style="font-size:13px;margin:0">Delete {{ recipeTitle }}? This cannot be undone.</p><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px"><button class="btn btn-secondary" sc-camel-on-click="{{ cancelDeleteRecipe }}">Cancel</button><button class="btn btn-primary" sc-camel-on-click="{{ confirmDeleteRecipe }}" style="background:#b0563e;border-color:#b0563e">Delete</button></div></div></div></sc-if>',
    );
}

export function applyRecipeRecordBehavior(template: string): string {
  const base = replaceRecipeEditorMarkup(
    replaceRecipeNavigation(
      replacePackagingEditor(
        replacePackagingList(
          replaceRecipeEditorLogic(replaceRecipeList(addRecipeState(template))),
        ),
      ),
    ),
  );

  const withPackagingController = safelyApplyPackagingSection(
    "packaging controller",
    base,
    addPackagingController,
    withoutUnresolvedPackagingTokens,
  );

  return safelyApplyPackagingSection(
    "packaging dialogs",
    withPackagingController,
    value => replacePackagingDeleteDialog(replacePackagingPicker(value)),
    usePackagingPickerFallback,
  );
}