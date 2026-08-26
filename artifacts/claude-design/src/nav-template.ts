// Navigation in the order the work happens.
//
// The tab bar was laid out Home · Analytics · (sell) · Pantry · Markets, which
// put the reporting before the things being reported on and buried selling in
// the middle. A baker's week runs the other way: stock the pantry, plan a
// market, sell, then look at what it came to.
//
// Inside the pantry the same problem: it opened on Recipes, which cannot be
// written until there are ingredients and packaging to write them from.

/**
 * Pulls the tab bar's buttons apart and puts them back in a given order.
 * Matching on each button's own handler survives any restyling of the bar.
 */
function reorderTabBar(template: string): string {
  const barStart = template.indexOf(
    '<div style="flex:none;display:flex;align-items:stretch;border-top:1px solid var(--color-divider);background:var(--color-bg);padding:6px 8px 2px">',
  );
  if (barStart === -1) throw new Error("Missing tab bar anchor");
  const innerStart = template.indexOf(">", barStart) + 1;
  const innerEnd = template.indexOf("</div>", innerStart);
  if (innerEnd === -1) throw new Error("Unclosed tab bar");
  const inner = template.slice(innerStart, innerEnd);

  const buttons: string[] = [];
  let cursor = 0;
  while (true) {
    const open = inner.indexOf("<button", cursor);
    if (open === -1) break;
    const close = inner.indexOf("</button>", open);
    if (close === -1) throw new Error("Unclosed tab bar button");
    buttons.push(inner.slice(open, close + 9));
    cursor = close + 9;
  }
  if (buttons.length < 5) throw new Error(`Expected 5+ tab buttons, found ${buttons.length}`);

  const find = (handler: string) => {
    const hit = buttons.find((button) => button.includes(handler));
    if (!hit) throw new Error(`Missing tab button for ${handler}`);
    return hit;
  };

  // stock it, plan it, sell it, then read what it came to
  const ordered = [
    find("{{ goDash }}"),
    find("{{ goIngredients }}"),
    find("{{ goMarkets }}"),
    find("{{ goAnalytics }}"),
    payButton(find("{{ startSale }}")),
  ];
  // the hidden create button is dropped; nothing referenced it
  return (
    template.slice(0, innerStart) +
    "\n  " +
    ordered.join("\n  ") +
    "\n" +
    template.slice(innerEnd)
  );
}

/**
 * Selling sat in the middle of the bar as an unlabelled circle. At the end of
 * the row it needs a name, and it reads as one of the five steps rather than a
 * floating action.
 */
function payButton(original: string): string {
  const handler = original.includes("{{ startSale }}") ? "{{ startSale }}" : "{{ goSale }}";
  return (
    `<button sc-camel-on-click="${handler}" aria-label="New sale" style="flex:1;min-height:50px;background:none;border:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-family:var(--font-body);color:var(--color-accent)">` +
    '<svg width="20" height="20" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="6" width="20" height="13" rx="2"></rect><path d="M2 10h20"></path><path d="M6 15h4"></path></svg>' +
    '<span style="font-size:10px;font-weight:600">Pay</span></button>'
  );
}

/** The pantry opens on what a recipe is built from, not on the recipe. */
function reorderPantryTabs(template: string): string {
  const recipes =
    '<button sc-camel-on-click="{{ setPantryRec }}" style="flex:1;border:0;cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;padding:9px 0;border-radius:10px;background:{{ segRecBg }};color:{{ segRecColor }}">Recipes</button>';
  const ingredients =
    '<button sc-camel-on-click="{{ setPantryIng }}" style="flex:1;border:0;cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;padding:9px 0;border-radius:10px;background:{{ segIngBg }};color:{{ segIngColor }}">Ingredients</button>';
  const packaging =
    '<button sc-camel-on-click="{{ setPantryPack }}" style="flex:1;border:0;cursor:pointer;font-family:var(--font-body);font-size:12px;font-weight:600;padding:9px 0;border-radius:10px;background:{{ segPackBg }};color:{{ segPackColor }}">Packaging</button>';
  const before = `    ${recipes}\n    ${ingredients}\n    ${packaging}`;
  if (!template.includes(before)) throw new Error("Missing pantry tab strip anchor");
  return template.replace(
    before,
    () => `    ${ingredients}\n    ${packaging}\n    ${recipes}`,
  );
}

/**
 * A new baker lands on the pantry's first tab, not its last. Only the default
 * moves; goRecipes still opens Recipes deliberately.
 */
function defaultToIngredients(template: string): string {
  const anchor = "const pt = this.state.pantryTab || 'rec'";
  if (!template.includes(anchor)) throw new Error("Missing pantry tab default");
  return template.replace(anchor, () => "const pt = this.state.pantryTab || 'ing'");
}

export function applyNavBehavior(template: string): string {
  return defaultToIngredients(reorderPantryTabs(reorderTabBar(template)));
}
