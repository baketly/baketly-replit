// Looking at an item, and changing one.
//
// Opening a saved ingredient dropped you straight into a form: every field
// live, the name in an input, no way to just read what you had entered. The
// only way to leave was Back, and a stray tap changed a price. Deleting was a
// word in the header, sat where a title belongs.
//
// A saved item now opens as a preview — what it is, what it costs, what it is
// made of — with two round buttons at the top right: a pencil to change it and
// a minus to remove it. The form appears when the pencil is pressed, and its
// button says "Save changes". A NEW item skips the preview and opens straight
// into the form, whose button still says what it is saving.

const ICON_PENCIL = '<path d="M4 20h4l10-10-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path>';
const ICON_MINUS = '<circle cx="12" cy="12" r="9"></circle><path d="M8.5 12h7"></path>';

const iconButton = (handler: string, label: string, icon: string, color: string) =>
  `<button class="btn btn-icon btn-secondary" sc-camel-on-click="{{ ${handler} }}" aria-label="${label}" style="width:38px;height:38px;color:${color}">` +
  `<svg width="17" height="17" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></button>`;

/** The pencil and the minus, top right of an item. */
export const itemActions = (editHandler: string, deleteHandler: string, noun: string, previewFlag: string, existsFlag: string) =>
  `<div style="display:flex;gap:6px;flex:none">` +
  `<sc-if value="{{ ${previewFlag} }}" hint-placeholder-val="{{ false }}">${iconButton(editHandler, "Edit " + noun, ICON_PENCIL, "var(--color-text)")}</sc-if>` +
  `<sc-if value="{{ ${existsFlag} }}" hint-placeholder-val="{{ false }}">${iconButton(deleteHandler, "Delete " + noun, ICON_MINUS, "#b0563e")}</sc-if>` +
  `</div>`;

const modeController = `      ...(() => {
        const CUR = (({ USD: '$', EUR: '€', GBP: '£' })[this.state.currency] || '$');
        const openFor = this.state.editingKey || '';

        // A saved item is read-only until its pencil is pressed; a new one has
        // nothing to preview, so it opens in the form.
        const mode = (prefix, key) => {
          const exists = !!key;
          const editing = !exists || openFor === prefix + ':' + key;
          return {
            exists,
            editing,
            previewing: exists && !editing,
            start: () => this.setState({ editingKey: prefix + ':' + key })
          };
        };

        const ing = mode('ing', this.state.activeIngredientKey || '');
        // "Cost per g" reads as a fact; "Costs you" reads as a warning
        const ingKey = this.state.activeIngredientKey || '';
        const ingUnit = String(
          (this.state.ingredientDraft && this.state.ingredientDraft.unit)
          || ((this.state.ingredientRecords || {})[ingKey] || {}).unit
          || 'g'
        );
        const pack = mode('pack', this.state.activePackagingKey || '');
        const rec = mode('rec', this.state.activeRecipeId || '');

        // A market exists once it has been saved; until then there is nothing
        // to preview.
        const evSavedAlready = this.state.evSaved === true;
        const evOpenFor = openFor === 'ev:' + (this.state.eventCurrentId || '');
        const evEditing = !evSavedAlready || evOpenFor;
        const evWhen = new Date(this.state.eventDate || Date.now());

        return {
          ingEditing: ing.editing,
          ingPreviewing: ing.previewing,
          editIngredient: ing.start,
          ingSaveLabel: ing.exists ? 'Save changes' : 'Save ingredient',
          ingCostLabel: 'Cost per ' + (ingUnit === 'pc' ? 'unit' : ingUnit),
          ingPer100Label: 'Per 100 ' + (ingUnit === 'pc' ? 'units' : ingUnit),

          packEditing: pack.editing,
          packPreviewing: pack.previewing,
          editPackaging: pack.start,

          recEditing: rec.editing,
          recPreviewing: rec.previewing,
          editRecipe: rec.start,

          evEditing,
          evPreviewing: evSavedAlready && !evOpenFor,
          editEvent: () => this.setState({ editingKey: 'ev:' + (this.state.eventCurrentId || '') }),
          evDateLabel: isNaN(evWhen.getTime())
            ? ''
            : evWhen.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + evWhen.getDate()
              + ' ' + evWhen.toLocaleDateString('en-US', { month: 'long' }),
          evBoothLabel: CUR + (Number(this.state.eventBoothFee) || 0).toFixed(2),
        };
      })(),
`;

function addModeController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable item mode anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${modeController}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/** The macro strip the recipe editor uses, so a preview reads the same. */
const macroBoxes = (values: Array<[string, string]>) =>
  `<div style="display:grid;grid-template-columns:repeat(${values.length},1fr);border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-bottom:6px;background:#fff">` +
  values
    .map(
      ([label, value], index) =>
        `<div style="padding:12px 6px;text-align:center${index ? ";border-left:1px solid var(--color-divider)" : ""}">` +
        `<div style="font-family:var(--font-heading);font-weight:600;font-size:18px;font-feature-settings:'tnum'">${value}</div>` +
        `<div class="text-muted" style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase">${label}</div></div>`,
    )
    .join("") +
  `</div>`;

const row = (label: string, value: string) =>
  `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:11px 0;border-bottom:1px solid var(--color-divider)">` +
  `<span class="text-muted" style="font-size:13px">${label}</span>` +
  `<span style="font-size:14px;font-feature-settings:'tnum'">${value}</span></div>`;

const ingredientPreview =
  `<sc-if value="{{ ingPreviewing }}" hint-placeholder-val="{{ false }}">` +
  `<h2 style="font-size:26px;margin:8px 0 2px">{{ ingredientName }}</h2>` +
  `<p class="text-muted" style="font-size:13px;margin:0 0 18px">{{ ingredientSupplier }}</p>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:18px">` +
  row("Package price", "{{ currencySymbol }}{{ ingredientPackagePrice }}") +
  row("Package size", "{{ ingredientPackageSize }} {{ ingredientUnit }}") +
  row("{{ ingCostLabel }}", "{{ ingredientCostPer }}") +
  `</div>` +
  `<div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">{{ ingPer100Label }}</div>` +
  macroBoxes([
    ["kcal", "{{ ingredientKcal }}"],
    ["protein", "{{ ingredientProtein }}g"],
    ["carbs", "{{ ingredientCarbs }}g"],
    ["fat", "{{ ingredientFat }}g"],
    ["sugar", "{{ ingredientSugar }}g"],
  ]) +
  `</sc-if>`;

const packagingPreview =
  `<sc-if value="{{ packPreviewing }}" hint-placeholder-val="{{ false }}">` +
  `<h2 style="font-size:26px;margin:8px 0 2px">{{ packagingName }}</h2>` +
  `<p class="text-muted" style="font-size:13px;margin:0 0 18px">{{ packagingSupplier }}</p>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:8px">` +
  row("Pack price", "{{ currencySymbol }}{{ packagingPackPrice }}") +
  row("Units per pack", "{{ packagingUnitsPerPack }}") +
  row("Cost per unit", "{{ packagingCostPer }}") +
  `</div>` +
  `</sc-if>`;

/** Packaging, same shape as an ingredient. */
function packagingScreen(template: string): string {
  const deleteWord =
    '<sc-if value="{{ packagingExisting }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ requestDeletePackaging }}" style="min-height:44px;color:#b0563e">Delete</button></sc-if>';
  const formStart = '<div class="field" style="margin:6px 0 12px"><label>Packaging name</label>';
  const saveButton =
    '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ savePackaging }}" style="min-height:48px">{{ packagingSaveLabel }}</button>';
  if (!template.includes(deleteWord)) throw new Error("Missing packaging delete anchor");
  if (!template.includes(formStart)) throw new Error("Missing packaging form anchor");
  if (!template.includes(saveButton)) throw new Error("Missing packaging save anchor");
  return template
    .replace(deleteWord, () =>
      itemActions("editPackaging", "requestDeletePackaging", "packaging", "packPreviewing", "packagingExisting"),
    )
    .replace(
      formStart,
      () => packagingPreview + '<sc-if value="{{ packEditing }}" hint-placeholder-val="{{ true }}">' + formStart,
    )
    .replace(saveButton, () => saveButton + "</sc-if>");
}

/** Every route into the packaging editor starts in preview. */
function resetPackagingOnOpen(template: string): string {
  const anchor = "screen: 'packagingEdit', stack: [...st.stack, st.screen], activePackagingKey:";
  if (template.split(anchor).length - 1 === 0) throw new Error("Missing packaging open anchor");
  return template
    .split(anchor)
    .join("screen: 'packagingEdit', editingKey: '', stack: [...st.stack, st.screen], activePackagingKey:");
}

/** Swaps the header's Delete word for the two round buttons. */
function ingredientHeader(template: string): string {
  const anchor =
    '<sc-if value="{{ ingredientExisting }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ requestDeleteIngredient }}" style="min-height:44px;color:#b0563e">Delete</button></sc-if>';
  if (!template.includes(anchor)) throw new Error("Missing ingredient delete anchor");
  return template.replace(
    anchor,
    () => itemActions("editIngredient", "requestDeleteIngredient", "ingredient", "ingPreviewing", "ingredientExisting"),
  );
}

/** The form, and the button under it, only exist while changing the item. */
function ingredientForm(template: string): string {
  const formStart =
    '<div class="field" style="margin:6px 0 12px"><label>Ingredient name</label>';
  const saveButton =
    '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ saveIngredient }}" style="min-height:48px">Save ingredient</button>';
  if (!template.includes(formStart)) throw new Error("Missing ingredient form anchor");
  if (!template.includes(saveButton)) throw new Error("Missing ingredient save anchor");

  return template
    .replace(
      formStart,
      () => ingredientPreview + '<sc-if value="{{ ingEditing }}" hint-placeholder-val="{{ true }}">' + formStart,
    )
    .replace(
      saveButton,
      () =>
        '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ saveIngredient }}" style="min-height:48px">{{ ingSaveLabel }}</button></sc-if>',
    );
}

/**
 * Opening a saved item always starts in preview, never back where the pencil
 * was last pressed. Every route into the editor sets activeIngredientKey, so
 * clearing the flag there covers them all.
 */
function resetModeOnOpen(template: string): string {
  const anchor = "screen: 'ingredientEdit', stack: [...st.stack, st.screen], activeIngredientKey:";
  const count = template.split(anchor).length - 1;
  if (count === 0) throw new Error("Missing ingredient open anchor");
  return template
    .split(anchor)
    .join("screen: 'ingredientEdit', editingKey: '', stack: [...st.stack, st.screen], activeIngredientKey:");
}

/**
 * The preview is the editor with the controls taken out: same sections, same
 * order, same headings, so a recipe does not appear to change shape when the
 * pencil is pressed. Values that were inputs are plain text, and the buttons
 * that only make sense while editing — add from pantry, add packaging, the
 * per-row amount boxes and their × — are gone.
 */
const recipePreview =
  `<sc-if value="{{ recPreviewing }}" hint-placeholder-val="{{ false }}">` +

  // the name field, settled: the label stays, the input becomes the title
  `<div class="field" style="margin:6px 0 12px">` +
  `<div style="font-family:var(--font-heading);font-weight:600;font-size:22px;padding:10px 0 0">{{ recipeTitle }}</div></div>` +

  `<div style="display:flex;align-items:center;gap:10px;margin:4px 0 18px">` +
  `<span class="text-muted" style="font-size:13px">Batch yields</span>` +
  `<span style="font-size:14px;font-weight:600;font-feature-settings:'tnum'">{{ recipeYield }}</span>` +
  `<span class="text-muted" style="font-size:13px">units · retail</span></div>` +

  // the editor's four-column row without its amount box and remove button
  `<h6 style="margin-bottom:8px">Ingredients</h6>` +
  `<div style="display:flex;flex-direction:column;font-size:14px;margin-bottom:20px;border-bottom:1px solid var(--color-divider)">` +
  `<sc-for list="{{ recipeIngs }}" as="ing" hint-placeholder-count="3">` +
  `<div style="display:grid;grid-template-columns:1fr 100px 46px;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--color-divider)">` +
  `<span style="font-size:14px">{{ ing.name }}</span>` +
  `<span class="text-muted" style="font-size:13px;text-align:right;font-feature-settings:'tnum'">{{ ing.amt }} {{ ing.unit }}</span>` +
  `<span style="font-size:13px;text-align:right;font-feature-settings:'tnum'">{{ ing.costStr }}</span>` +
  `</div></sc-for></div>` +

  `<h6 style="margin-bottom:8px">Macros · per unit</h6>` +
  macroBoxes([
    ["kcal", "{{ macroKcal }}"],
    ["protein", "{{ macroProtein }}"],
    ["carbs", "{{ macroCarbs }}"],
    ["fat", "{{ macroFat }}"],
    ["sugar", "{{ macroSugar }}"],
  ]) +
  `<div class="text-muted" style="font-size:12px;margin-bottom:20px">{{ macroNote }}</div>` +

  `<h6 style="margin-bottom:8px">Packaging</h6>` +
  `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">` +
  `<sc-for list="{{ recipePacks }}" as="pk" hint-placeholder-count="2">` +
  `<span class="tag tag-neutral" style="font-feature-settings:'tnum'">{{ pk.label }}</span>` +
  `</sc-for></div>` +

  // the cost block reads the same in both modes
  `<div style="border-top:2px solid var(--color-text);padding-top:12px;display:flex;justify-content:space-between;align-items:baseline">` +
  `<span style="font-family:var(--font-heading);font-weight:600;font-size:17px">Cost per unit</span>` +
  `<span style="font-family:var(--font-heading);font-weight:600;font-size:26px;font-feature-settings:'tnum'">{{ recipeCostPer }}</span></div>` +
  `<div class="text-muted" style="font-size:12px;margin-top:4px">Batch {{ recipeBatch }} incl. packaging · labor not set</div>` +
  `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-top:16px;background:#fff">` +
  `<div style="padding:14px 16px"><div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Sells today</div>` +
  `<div style="font-family:var(--font-heading);font-weight:600;font-size:26px;font-feature-settings:'tnum'">{{ recipeSell }}</div></div>` +
  `<div style="padding:14px 16px;border-left:1px solid var(--color-divider)"><div class="text-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Margin</div>` +
  `<div style="font-family:var(--font-heading);font-weight:600;font-size:26px;font-feature-settings:'tnum'">{{ recipeMargin }}</div></div></div>` +
  `<div class="text-muted" style="font-size:12px;margin-top:6px">Margin = what you keep of the {{ recipeSell }} price after ingredients and packaging.</div>` +
  `</sc-if>`;

/** A recipe is worth reading before it is edited: costs, lines and margin. */
function recipeScreen(template: string): string {
  const headerRow =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><button class="btn btn-ghost" sc-camel-on-click="{{ back }}" style="margin-left:-6px;min-height:44px">‹ Recipes</button><sc-if value="{{ existingRecipeMode }}" hint-placeholder-val="{{ false }}"><button class="btn btn-ghost" sc-camel-on-click="{{ requestDeleteRecipe }}" style="min-height:44px;color:#b0563e">Delete</button></sc-if></div>';
  const saveButton =
    '<button class="btn btn-primary btn-block" sc-camel-on-click="{{ saveRecipe }}" style="margin-top:16px;min-height:48px">{{ saveRecipeLabel }}</button>';
  if (!template.includes(headerRow)) throw new Error("Missing recipe header anchor");
  if (!template.includes(saveButton)) throw new Error("Missing recipe save anchor");

  const newHeader =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><button class="btn btn-ghost" sc-camel-on-click="{{ back }}" style="margin-left:-6px;min-height:44px">‹ Recipes</button>' +
    itemActions("editRecipe", "requestDeleteRecipe", "recipe", "recPreviewing", "existingRecipeMode") +
    "</div>";

  return template
    .replace(
      headerRow,
      () => newHeader + recipePreview + '<sc-if value="{{ recEditing }}" hint-placeholder-val="{{ true }}">',
    )
    .replace(saveButton, () => saveButton + "</sc-if>");
}

/** Every route into the recipe editor starts in preview. */
function resetRecipeOnOpen(template: string): string {
  const anchor = "screen: 'recipeEditor', stack: [...st.stack, st.screen], activeRecipeId:";
  if (template.split(anchor).length - 1 === 0) throw new Error("Missing recipe open anchor");
  return template
    .split(anchor)
    .join("screen: 'recipeEditor', editingKey: '', stack: [...st.stack, st.screen], activeRecipeId:");
}

const eventPreview =
  `<sc-if value="{{ evPreviewing }}" hint-placeholder-val="{{ false }}">` +
  `<h2 style="font-size:28px;margin:6px 0 2px">{{ eventName }}</h2>` +
  `<p class="text-muted" style="font-size:13px;margin:0 0 18px">{{ evDateLabel }} · booth {{ evBoothLabel }}</p>` +
  `<div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Baking for this market</div>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:18px">` +
  `<sc-for list="{{ evLineup }}" as="line" hint-placeholder-count="3">` +
  `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-divider)">` +
  `<span style="font-size:14px">{{ line.name }}</span>` +
  `<span class="text-muted" style="font-size:13px;font-feature-settings:'tnum'">{{ line.qty }} × {{ line.priceStr }} · {{ line.revStr }}</span>` +
  `</div></sc-for>` +
  `<sc-if value="{{ evLineupEmpty }}" hint-placeholder-val="{{ false }}">` +
  `<div class="text-muted" style="font-size:13px;padding:14px 0">Nothing planned to bake yet.</div>` +
  `</sc-if>` +
  `</div>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:18px">` +
  row("Units planned", "{{ evUnits }}") +
  row("Expected revenue", "{{ evRevenue }}") +
  row("Expected cost", "{{ evCost }}") +
  row("Expected profit", "{{ evProfit }}") +
  row("Expected margin", "{{ evMargin }}") +
  `</div>` +
  `<button class="btn btn-secondary btn-block" sc-camel-on-click="{{ goShopping }}" style="min-height:46px;margin-bottom:8px">Shopping list · {{ shopProgress }} collected</button>` +
  "<!--finish-here-->" +
  `</sc-if>`;

/**
 * The market screen. Its delete moves from a ghost button at the very bottom
 * up to the header, beside the pencil, so it sits where every other item's
 * does.
 */
function eventScreen(template: string): string {
  const backButton =
    '<button class="btn btn-ghost" sc-camel-on-click="{{ goMarkets }}" style="margin-left:-6px;min-height:44px">‹ Markets</button>';
  const pickerStart = '<sc-if value="{{ evPickerOpen }}" hint-placeholder-val="{{ false }}">';
  const bottomDelete =
    '  <sc-if value="{{ evCanDelete }}" hint-placeholder-val="{{ false }}">\n    <button class="btn btn-ghost btn-block" sc-camel-on-click="{{ askDeleteEvent }}" style="min-height:44px;color:#b0563e">Delete event</button>\n  </sc-if>\n';
  if (!template.includes(backButton)) throw new Error("Missing event back anchor");
  if (!template.includes(pickerStart)) throw new Error("Missing event picker anchor");
  if (!template.includes(bottomDelete)) throw new Error("Missing event bottom delete anchor");

  const header =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
    backButton +
    itemActions("editEvent", "askDeleteEvent", "event", "evPreviewing", "evCanDelete") +
    "</div>";

  let out = template
    .replace(backButton, () => header + eventPreview + '<sc-if value="{{ evEditing }}" hint-placeholder-val="{{ true }}">')
    .replace(bottomDelete, () => "")
    .replace(pickerStart, () => "</sc-if>" + pickerStart);

  // Marking a market completed is something you do to a finished market, not
  // while editing its plan — so the button and the "what sold" step it opens
  // both move out of the planner and into the preview.
  const markButton =
    '  <sc-if value="{{ evCanComplete }}" hint-placeholder-val="{{ false }}">\n    <button class="btn btn-secondary btn-block" sc-camel-on-click="{{ startCompleting }}" style="min-height:46px;margin-bottom:10px">Mark completed</button>\n  </sc-if>\n';
  if (!out.includes(markButton)) throw new Error("Missing mark-completed anchor");
  out = out.replace(markButton, () => "");

  const results = liftBlock(out, '<sc-if value="{{ evEnteringResults }}"');
  out = results.without;

  const marker = "<!--finish-here-->";
  if (!out.includes(marker)) throw new Error("Missing preview finish marker");
  return out.replace(marker, () => results.block + markButton.trim());
}

/** Cuts one whole sc-if block out of the template, nesting included. */
function liftBlock(template: string, open: string): { block: string; without: string } {
  const start = template.indexOf(open);
  if (start === -1) throw new Error("Missing block " + open);
  const innerStart = template.indexOf(">", start) + 1;
  let depth = 1;
  let cursor = innerStart;
  while (depth > 0) {
    const nextOpen = template.indexOf("<sc-if", cursor);
    const nextClose = template.indexOf("</sc-if>", cursor);
    if (nextClose === -1) throw new Error("Unclosed block " + open);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 6;
    } else {
      depth -= 1;
      if (depth === 0) {
        const end = nextClose + 8;
        return { block: template.slice(start, end), without: template.slice(0, start) + template.slice(end) };
      }
      cursor = nextClose + 8;
    }
  }
  throw new Error("Unclosed block " + open);
}

/** Opening a saved market starts in preview. */
function resetEventOnOpen(template: string): string {
  const anchor = "screen: 'event',";
  if (template.split(anchor).length - 1 === 0) throw new Error("Missing event open anchor");
  return template.split(anchor).join("screen: 'event', editingKey: '',");
}

export function applyItemModeBehavior(template: string): string {
  let out = addModeController(template);
  out = ingredientHeader(out);
  out = ingredientForm(out);
  out = resetModeOnOpen(out);
  out = packagingScreen(out);
  out = resetPackagingOnOpen(out);
  out = recipeScreen(out);
  out = resetRecipeOnOpen(out);
  out = eventScreen(out);
  return resetEventOnOpen(out);
}
