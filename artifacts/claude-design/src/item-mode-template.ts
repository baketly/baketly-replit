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

        return {
          ingEditing: ing.editing,
          ingPreviewing: ing.previewing,
          editIngredient: ing.start,
          ingSaveLabel: ing.exists ? 'Save changes' : 'Save ingredient',
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

export function applyItemModeBehavior(template: string): string {
  return resetModeOnOpen(ingredientForm(ingredientHeader(addModeController(template))));
}
