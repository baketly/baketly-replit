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
  row("Costs you", "{{ ingredientCostPer }}") +
  `</div>` +
  `<div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Per 100 {{ ingredientUnit }}</div>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:8px">` +
  row("Calories", "{{ ingredientKcal }}") +
  row("Protein", "{{ ingredientProtein }} g") +
  row("Carbs", "{{ ingredientCarbs }} g") +
  row("Fat", "{{ ingredientFat }} g") +
  `</div>` +
  `</sc-if>`;

const packagingPreview =
  `<sc-if value="{{ packPreviewing }}" hint-placeholder-val="{{ false }}">` +
  `<h2 style="font-size:26px;margin:8px 0 2px">{{ packagingName }}</h2>` +
  `<p class="text-muted" style="font-size:13px;margin:0 0 18px">{{ packagingSupplier }}</p>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:8px">` +
  row("Pack price", "{{ currencySymbol }}{{ packagingPackPrice }}") +
  row("Units per pack", "{{ packagingUnitsPerPack }}") +
  row("Costs you", "{{ packagingCostPer }} each") +
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

const recipePreview =
  `<sc-if value="{{ recPreviewing }}" hint-placeholder-val="{{ false }}">` +
  `<h2 style="font-size:28px;margin:6px 0 2px">{{ recipeTitle }}</h2>` +
  `<p class="text-muted" style="font-size:13px;margin:0 0 18px">Makes {{ recipeYield }} per batch</p>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:20px">` +
  row("Sells for", "{{ recipeSell }}") +
  row("Costs to make", "{{ recipeCostPer }} each") +
  row("Whole batch", "{{ recipeBatch }}") +
  row("Margin", "{{ recipeMargin }}") +
  `</div>` +
  `<div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Ingredients</div>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:18px">` +
  `<sc-for list="{{ recipeIngs }}" as="ing" hint-placeholder-count="3">` +
  `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-divider)">` +
  `<span style="font-size:14px">{{ ing.name }}</span>` +
  `<span class="text-muted" style="font-size:13px;font-feature-settings:'tnum'">{{ ing.amt }} {{ ing.unit }} · {{ ing.costStr }}</span>` +
  `</div></sc-for></div>` +
  `<div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Packaging</div>` +
  `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">` +
  `<sc-for list="{{ recipePacks }}" as="pk" hint-placeholder-count="2">` +
  `<span class="tag tag-neutral">{{ pk.label }}</span>` +
  `</sc-for></div>` +
  `<div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Macros · per unit</div>` +
  `<div style="display:flex;flex-direction:column;margin-bottom:8px">` +
  row("Calories", "{{ macroKcal }}") +
  row("Protein", "{{ macroProtein }}") +
  row("Carbs", "{{ macroCarbs }}") +
  row("Fat", "{{ macroFat }}") +
  `</div>` +
  `<p class="text-muted" style="font-size:12px;line-height:1.5">{{ macroNote }}</p>` +
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

  return template
    .replace(backButton, () => header + eventPreview + '<sc-if value="{{ evEditing }}" hint-placeholder-val="{{ true }}">')
    .replace(bottomDelete, () => "")
    .replace(pickerStart, () => "</sc-if>" + pickerStart);
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
