// Recipe groups the baker names.
//
// Every recipe carried a type from a fixed four — bread, babka, cookie, treat —
// and every list that could be narrowed offered exactly those four chips. A
// bakery that sells pies, or splits cookies into big and small, had nowhere to
// put them.
//
// The groups are now a list kept in Settings: named, renamed, reordered and
// removed there. A recipe's type holds the id of its group, which is why every
// place that filtered by type keeps working. Until the baker edits the list it
// is the original four, under the ids recipes already carry. A recipe whose
// group no longer exists shows as "No group" rather than vanishing.
//
// The Recipes list is ordered by group, in the order the groups are listed,
// with each group's name above its recipes. A–Z and Price are still a tap away.

function swapOnce(template: string, from: string, to: string, label: string): string {
  const count = template.split(from).length - 1;
  if (count !== 1) throw new Error(`Recipe groups ${label}: expected 1 anchor, found ${count}`);
  return template.replace(from, () => to);
}

const ALL_FOUR = "[['all', 'All'], ['bread', 'Bread'], ['babka', 'Babka'], ['cookie', 'Cookies'], ['treat', 'Treats']]";

/** The component learns what the groups are, once, for every screen to ask. */
const groupMethods = `  recipeGroupList() {
    const saved = Array.isArray(this.state.recipeGroups) ? this.state.recipeGroups.filter(g => g && g.id) : null;
    return saved || [{ id: 'bread', name: 'Bread' }, { id: 'babka', name: 'Babka' }, { id: 'cookie', name: 'Cookies' }, { id: 'treat', name: 'Treats' }];
  }
  recipeGroupOf(recipe) {
    const id = String((recipe && recipe.type) || '');
    return this.recipeGroupList().some(g => g.id === id) ? id : 'none';
  }
  recipeGroupName(id) {
    const found = this.recipeGroupList().find(g => g.id === id);
    return found ? (String(found.name || '').trim() || 'Untitled group') : 'No group';
  }
  recipeGroupChoices(recipes) {
    const list = Array.isArray(recipes) ? recipes : [];
    const choices = [['all', 'All'], ...this.recipeGroupList().map(g => [g.id, String(g.name || '').trim() || 'Untitled group'])];
    if (list.some(r => this.recipeGroupOf(r) === 'none')) choices.push(['none', 'No group']);
    return choices;
  }
`;

function addGroupMethods(template: string): string {
  return swapOnce(template, "  REC_ICONS = {", groupMethods + "  REC_ICONS = {", "methods");
}

/** Recipes list: chips are the groups, and the list is ordered by them. */
function groupRecipeList(template: string): string {
  let out = swapOnce(
    template,
    "        let list = records.filter(r => rf === 'all' || r.type === rf);\n" +
      "        if (rs === 'az') list = [...list].sort((x, y) => x.name.localeCompare(y.name));\n" +
      "        if (rs === 'price') list = [...list].sort((x, y) => y.price - x.price);",
    `        const recChoices = this.recipeGroupChoices(records);
        const recPick = recChoices.some(choice => choice[0] === rf) ? rf : 'all';
        const sortMode = rs === 'az' || rs === 'price' ? rs : 'group';
        let list = records.filter(r => recPick === 'all' || this.recipeGroupOf(r) === recPick);
        if (sortMode === 'az') list = [...list].sort((x, y) => x.name.localeCompare(y.name));
        if (sortMode === 'price') list = [...list].sort((x, y) => y.price - x.price);
        const groupOrder = {};
        this.recipeGroupList().forEach((g, i) => { groupOrder[g.id] = i; });
        if (sortMode === 'group') {
          list = [...list].sort((x, y) => (groupOrder[this.recipeGroupOf(x)] ?? 9999) - (groupOrder[this.recipeGroupOf(y)] ?? 9999));
        }`,
    "list filter",
  );

  out = swapOnce(
    out,
    "        const recipeList = list.map(r => {\n          const cost = recipeUnitCost(r);\n          return {",
    `        const recipeList = list.map((r, index) => {
          const cost = recipeUnitCost(r);
          const groupId = this.recipeGroupOf(r);
          return {
            groupHeaderShow: sortMode === 'group' && (index === 0 || this.recipeGroupOf(list[index - 1]) !== groupId),
            groupHeader: this.recipeGroupName(groupId),`,
    "list rows",
  );

  out = swapOnce(
    out,
    `        const recFilters = ${ALL_FOUR}.map(([k, label]) => ({
          label, set: () => this.setState({ recFilter: k }),
          border: rf === k ? 'var(--color-accent)' : 'var(--color-neutral-300)',
          bg: rf === k ? 'var(--color-accent)' : '#fff',
          color: rf === k ? '#fff' : '#8a8578'
        }));`,
    `        const recFilters = recChoices.map(([k, label]) => ({
          label, set: () => this.setState({ recFilter: k }),
          border: recPick === k ? 'var(--color-accent)' : 'var(--color-neutral-300)',
          bg: recPick === k ? 'var(--color-accent)' : '#fff',
          color: recPick === k ? '#fff' : '#8a8578'
        }));`,
    "list chips",
  );

  out = swapOnce(
    out,
    "recSortLabel: rs === 'az' ? 'A–Z' : (rs === 'price' ? 'Price ↓' : 'Sort'),\n" +
      "          toggleRecSort: () => this.setState({ recSort: rs === 'default' ? 'az' : (rs === 'az' ? 'price' : 'default') }),",
    "recSortLabel: sortMode === 'az' ? 'A–Z' : (sortMode === 'price' ? 'Price ↓' : 'Group'),\n" +
      "          toggleRecSort: () => this.setState({ recSort: sortMode === 'group' ? 'az' : (sortMode === 'az' ? 'price' : 'group') }),",
    "list sort",
  );

  return swapOnce(
    out,
    '<sc-for list="{{ recipeList }}" as="r" hint-placeholder-count="6">',
    '<sc-for list="{{ recipeList }}" as="r" hint-placeholder-count="6">' +
      '<sc-if value="{{ r.groupHeaderShow }}" hint-placeholder-val="{{ false }}">' +
      '<div class="text-muted" style="font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:14px 0 6px;border-top:1px solid var(--color-divider)">{{ r.groupHeader }}</div></sc-if>',
    "list headers",
  );
}

/** The till's category chips and filter. */
function groupTill(template: string): string {
  const out = swapOnce(
    template,
    `posCats: ${ALL_FOUR}.map(`,
    "posCats: this.recipeGroupChoices(posRecipes).map(",
    "till chips",
  );
  return swapOnce(
    out,
    "const visible = posRecipes.filter(r => (posCat === 'all' || r.type === posCat)",
    "const posCatKnown = this.recipeGroupChoices(posRecipes).some(choice => choice[0] === posCat);\n" +
      "            const visible = posRecipes.filter(r => (posCat === 'all' || !posCatKnown || this.recipeGroupOf(r) === posCat)",
    "till filter",
  );
}

/** A market's product picker. */
function groupEventPicker(template: string): string {
  let out = swapOnce(
    template,
    "const presentTypes = [...new Set(notPicked.map(recipe => recipe.type || 'treat'))];",
    "const presentTypes = [...new Set(notPicked.map(recipe => this.recipeGroupOf(recipe)))];",
    "picker present",
  );
  out = swapOnce(
    out,
    "&& (typeFilter === 'all' || (recipe.type || 'treat') === typeFilter));",
    "&& (typeFilter === 'all' || !presentTypes.includes(typeFilter) || this.recipeGroupOf(recipe) === typeFilter));",
    "picker filter",
  );
  return swapOnce(
    out,
    `evPickerCats: ${ALL_FOUR}\n`,
    "evPickerCats: this.recipeGroupChoices(notPicked)\n",
    "picker chips",
  );
}

/** Analytics' by-group breakdown names the baker's groups. */
function groupAnalytics(template: string): string {
  let out = swapOnce(
    template,
    "const groupLabels = { bread: 'Bread', babka: 'Babka', cookie: 'Cookies', treat: 'Treats', other: 'Other' };",
    "const groupLabels = { ...Object.fromEntries(this.recipeGroupList().map(g => [g.id, this.recipeGroupName(g.id)])), other: 'No group' };",
    "analytics labels",
  );
  return swapOnce(
    out,
    "const key = recipe && groupLabels[recipe.type] ? recipe.type : 'other';",
    "const key = recipe && this.recipeGroupOf(recipe) !== 'none' ? this.recipeGroupOf(recipe) : 'other';",
    "analytics key",
  );
}

/** The recipe editor picks a group; its preview names it. */
function groupRecipeEditor(template: string): string {
  let out = swapOnce(
    template,
    "          recipeTitle: recipe.name,\n",
    `          recipeTitle: recipe.name,
          recipeGroupLabel: this.recipeGroupName(this.recipeGroupOf(recipe)),
          recipeGroupOpts: [...this.recipeGroupList().map(g => [g.id, this.recipeGroupName(g.id)]), ['', 'No group']].map(([id, label]) => {
            const on = id === '' ? this.recipeGroupOf(recipe) === 'none' : this.recipeGroupOf(recipe) === id;
            return {
              label,
              pick: () => updateRecipe({ type: id }),
              border: on ? 'var(--color-accent)' : 'var(--color-neutral-300)',
              bg: on ? 'var(--color-accent)' : '#fff',
              color: on ? '#fff' : '#8a8578'
            };
          }),
`,
    "editor bindings",
  );

  const nameField = 'placeholder="Name your recipe" aria-label="Recipe name"';
  const at = out.indexOf(nameField);
  if (at === -1 || out.indexOf(nameField, at + 1) !== -1) throw new Error("Recipe groups name field: expected 1 anchor");
  const fieldEnd = out.indexOf("</div>", at) + "</div>".length;
  const chooser =
    '<div class="field" style="margin:0 0 16px"><label>Group</label>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">' +
    '<sc-for list="{{ recipeGroupOpts }}" as="g" hint-placeholder-count="4">' +
    '<button sc-camel-on-click="{{ g.pick }}" style="height:30px;padding:0 11px;font-family:var(--font-body);font-size:11px;font-weight:600;border-radius:999px;cursor:pointer;border:1px solid {{ g.border }};background:{{ g.bg }};color:{{ g.color }}">{{ g.label }}</button>' +
    "</sc-for></div></div>";
  out = out.slice(0, fieldEnd) + chooser + out.slice(fieldEnd);

  // the preview's title, settled, with its group beneath
  return swapOnce(
    out,
    '<div style="font-family:var(--font-heading);font-weight:600;font-size:22px;padding:10px 0 0">{{ recipeTitle }}</div></div>',
    '<div style="font-family:var(--font-heading);font-weight:600;font-size:22px;padding:10px 0 0">{{ recipeTitle }}</div>' +
      '<div class="text-muted" style="font-size:12px;margin-top:2px">{{ recipeGroupLabel }}</div></div>',
    "preview label",
  );
}

/** Settings: the list of groups itself. */
const settingsGroups = `      ...(() => {
        const groups = this.recipeGroupList();
        const recipes = Array.isArray(this.state.recipeRecords) ? this.state.recipeRecords : [];
        const saveGroups = next => this.setState({ recipeGroups: next });
        const move = (from, to) => {
          if (to < 0 || to >= groups.length) return;
          const next = [...groups];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          saveGroups(next);
        };
        return {
          settingsGroups: groups.map((g, i) => {
            const count = recipes.filter(r => this.recipeGroupOf(r) === g.id).length;
            return {
              name: String(g.name || ''),
              countStr: count + (count === 1 ? ' recipe' : ' recipes'),
              rename: e => saveGroups(groups.map(x => x.id === g.id ? { ...x, name: String(e.target.value || '').slice(0, 40) } : x)),
              up: () => move(i, i - 1),
              down: () => move(i, i + 1),
              upOpacity: i === 0 ? '0.3' : '1',
              downOpacity: i === groups.length - 1 ? '0.3' : '1',
              remove: () => saveGroups(groups.filter(x => x.id !== g.id))
            };
          }),
          settingsHasNoGroups: groups.length === 0,
          groupDraft: String(this.state.groupDraft || ''),
          setGroupDraft: e => this.setState({ groupDraft: String(e.target.value || '').slice(0, 40) }),
          addGroup: () => this.setState(st => {
            const name = String(st.groupDraft || '').trim();
            if (!name) return {};
            const current = this.recipeGroupList();
            if (current.length >= 50) return {};
            return { recipeGroups: [...current, { id: 'g-' + Date.now().toString(36), name }], groupDraft: '' };
          })
        };
      })(),
`;

const ARROW = (d: string) =>
  `<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"></path></svg>`;
const smallRound =
  "flex:none;width:30px;height:30px;min-height:0;padding:0;border-radius:50%;border:1px solid var(--color-neutral-300);background:#fff;cursor:pointer;display:grid;place-items:center;color:var(--color-text)";

const settingsGroupsMarkup =
  '<div style="border:1px solid var(--color-divider);border-radius:12px;background:#fff;padding:13px 14px;margin-top:6px">' +
  '<div class="text-muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px">Recipe groups</div>' +
  '<div class="text-muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">How your recipes are sorted and filtered. Put each recipe in a group from its own page. Removing a group moves its recipes to No group.</div>' +
  '<sc-if value="{{ settingsHasNoGroups }}" hint-placeholder-val="{{ false }}"><div class="text-muted" style="font-size:13px;padding:6px 0 10px">No groups yet.</div></sc-if>' +
  '<sc-for list="{{ settingsGroups }}" as="sg" hint-placeholder-count="4">' +
  '<div style="display:flex;align-items:center;gap:6px;padding:7px 0;border-top:1px solid var(--color-divider)">' +
  '<div style="flex:1;min-width:0"><input class="input" value="{{ sg.name }}" sc-camel-on-change="{{ sg.rename }}" aria-label="Group name" placeholder="Untitled group" style="width:100%;padding:8px 10px;font-size:14px">' +
  '<div class="text-muted" style="font-size:11px;margin:3px 2px 0">{{ sg.countStr }}</div></div>' +
  `<button sc-camel-on-click="{{ sg.up }}" aria-label="Move group up" style="${smallRound};opacity:{{ sg.upOpacity }}">${ARROW("M18 15l-6-6-6 6")}</button>` +
  `<button sc-camel-on-click="{{ sg.down }}" aria-label="Move group down" style="${smallRound};opacity:{{ sg.downOpacity }}">${ARROW("M6 9l6 6 6-6")}</button>` +
  `<button sc-camel-on-click="{{ sg.remove }}" aria-label="Remove group" style="${smallRound};color:#b0563e;font-size:17px;line-height:1">×</button>` +
  "</div></sc-for>" +
  '<div style="display:flex;gap:8px;margin-top:10px">' +
  '<input class="input" value="{{ groupDraft }}" sc-camel-on-change="{{ setGroupDraft }}" aria-label="New group name" placeholder="New group, e.g. Pies" style="flex:1;min-width:0;padding:9px 12px;font-size:14px">' +
  '<button class="btn btn-secondary" sc-camel-on-click="{{ addGroup }}" style="flex:none;min-height:40px;padding:0 14px;font-size:13px">Add</button>' +
  "</div></div>";

function groupSettings(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing recipe groups controller anchor");
  const out = template.replace(
    anchor,
    (_match, indent: string) => `${settingsGroups}${indent}onAnalytics: screen === 'analytics',`,
  );
  return swapOnce(
    out,
    "      <!-- the sample bakery lived in Settings before the sections did; it",
    settingsGroupsMarkup + "\n      <!-- the sample bakery lived in Settings before the sections did; it",
    "settings section",
  );
}

export function applyRecipeGroupsBehavior(template: string): string {
  let out = addGroupMethods(template);
  out = groupRecipeList(out);
  out = groupTill(out);
  out = groupEventPicker(out);
  out = groupAnalytics(out);
  out = groupRecipeEditor(out);
  return groupSettings(out);
}
