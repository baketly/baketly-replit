// Layout fixes that apply across every screen.
//
// The "add an ingredient" form scrolled sideways: Package price and Package
// size sit in a two-column grid, and each column was sized `1fr`. That is
// shorthand for minmax(auto, 1fr), and the `auto` floor means a column can
// never shrink below its content's min-content width. An <input> with no size
// attribute reports about 205px, so two of them plus the gap came to 422px on
// a 375px screen and the form overflowed by 83px.
//
// Clamping the floor to zero lets the columns share the width they actually
// have, which is what `1fr` was meant to do.

/** Grid tracks that can shrink, everywhere the page declares equal columns. */
function clampGridColumns(template: string): string {
  // longest first: "1fr 1fr" is a prefix of "1fr 1fr 1fr"
  const swaps: Array<[string, string]> = [
    ["grid-template-columns:1fr 1fr 1fr", "grid-template-columns:repeat(3,minmax(0,1fr))"],
    ["grid-template-columns:1fr 1fr", "grid-template-columns:repeat(2,minmax(0,1fr))"],
    ["grid-template-columns:repeat(2,1fr)", "grid-template-columns:repeat(2,minmax(0,1fr))"],
    ["grid-template-columns:repeat(3,1fr)", "grid-template-columns:repeat(3,minmax(0,1fr))"],
    ["grid-template-columns:repeat(4,1fr)", "grid-template-columns:repeat(4,minmax(0,1fr))"],
    ["grid-template-columns:repeat(5,1fr)", "grid-template-columns:repeat(5,minmax(0,1fr))"],
  ];
  let out = template;
  let changed = 0;
  for (const [from, to] of swaps) {
    const hits = out.split(from).length - 1;
    if (hits) {
      changed += hits;
      out = out.split(from).join(to);
    }
  }
  if (!changed) throw new Error("Missing grid column anchors");
  return out;
}

/**
 * A field is a flex column, and flex items also refuse to shrink below their
 * content. The same floor has to come off, or a long value pushes its way out
 * of a row that was sized correctly.
 */
function fieldsCanShrink(template: string): string {
  const anchor = ".field{display:flex;flex-direction:column;gap:6px}";
  if (!template.includes(anchor)) throw new Error("Missing field style anchor");
  return template.replace(
    anchor,
    () =>
      ".field{display:flex;flex-direction:column;gap:6px;min-width:0}" +
      ".field>.input{width:100%;min-width:0}",
  );
}

/**
 * Pantry's Packaging tab sat 15px wider than Ingredients and Recipes. Those
 * two lists are long enough to scroll, so the scroll body loses 15px to the
 * scrollbar; Packaging's shorter list does not scroll, so it keeps the full
 * width. Reserving the gutter on every screen body means a screen is the same
 * width whether its content happens to overflow or not.
 */
function reserveScrollbarGutter(template: string): string {
  const anchor = "flex:1;overflow:auto;min-height:0";
  // Three come from the generated markup; earlier passes add their own screens,
  // so guard that the anchor still exists rather than pinning an exact count.
  const hits = template.split(anchor).length - 1;
  if (hits < 3) throw new Error(`Expected at least 3 scroll bodies, found ${hits}`);
  return template.split(anchor).join(anchor + ";scrollbar-gutter:stable");
}

export function applyLayoutBehavior(template: string): string {
  return reserveScrollbarGutter(fieldsCanShrink(clampGridColumns(template)));
}
