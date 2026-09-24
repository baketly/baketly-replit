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

import { isNativeApp } from "./api";

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

/**
 * "You kept" became "You earned" everywhere it is shown. The last pass, so it
 * also reaches any label still in the generated markup, wherever it survives.
 */
function sayEarnedNotKept(template: string): string {
  return template.split(">You kept<").join(">You earned<");
}

/**
 * Room for the notch and the home indicator.
 *
 * In a browser tab the page starts below the phone's own furniture. In the app
 * it does not: the web view fills the screen, so a header would sit under the
 * clock and the tab bar under the home indicator, where a swipe leaves the app
 * instead of pressing the button.
 *
 * iOS only reports env(safe-area-inset-*) once the viewport opts in with
 * viewport-fit=cover, so that comes first. The meta tag is matched loosely: it
 * has been written both `initial-scale=1` and `initial-scale=1.0`, and pinning
 * the exact text meant the rewrite quietly did nothing.
 */
function respectSafeAreas(template: string): string {
  const meta = /<meta\s+name="viewport"\s+content="([^"]*)">/;
  const found = template.match(meta);
  if (!found) throw new Error("Missing viewport meta");
  if (found[1].includes("viewport-fit")) return template;
  return template.replace(
    meta,
    () => `<meta name="viewport" content="${found[1]}, viewport-fit=cover">`,
  );
}

/**
 * Out of the mockup, onto the phone.
 *
 * The generated page draws Baketly inside a picture of an iPhone, centred on an
 * olive background — right on a desktop, absurd inside the app, where it would
 * be a phone drawn inside a phone with a green border around it.
 *
 * Wrapped for iOS the same markup has to fill the screen instead: the backdrop
 * loses its padding, the drawn frame is unwrapped, and the two paddings that
 * stood in for the phone's furniture become the insets the phone reports. Only
 * the app takes this path, so the site keeps the frame it was designed with.
 */
export function fillTheScreen(template: string, native: boolean): string {
  if (!native) return template;

  const once = (subject: string, from: string, to: string, what: string) => {
    if (subject.split(from).length - 1 !== 1) throw new Error(`Expected one ${what}`);
    return subject.split(from).join(to);
  };

  // the olive backdrop the frame is centred on. On a phone it is the screen
  // itself: exactly one screen tall, so the tab bar stays on it and the lists
  // inside do the scrolling
  let out = once(
    template,
    '<div style="min-height:100vh;display:flex;justify-content:center;align-items:flex-start;' +
      'padding:36px 16px;background:#8e9a48;font-family:var(--font-body)">',
    '<div style="height:100vh;display:flex;flex-direction:column;overflow:hidden;' +
      'background:var(--color-bg);font-family:var(--font-body)">',
    "page backdrop",
  );

  // the drawn phone itself. Its contents are kept; only the wrapper goes, so
  // every screen inside is untouched.
  const frameOpen = out.indexOf('<x-import component-from-global-scope="IOSDevice"');
  if (frameOpen === -1) throw new Error("Missing device frame");
  const frameOpenEnd = out.indexOf(">", frameOpen);
  if (frameOpenEnd === -1) throw new Error("Unclosed device frame tag");
  out = out.slice(0, frameOpen) + out.slice(frameOpenEnd + 1);
  out = once(out, "</x-import>", "", "device frame close");

  // 62px was room for the picture's status bar; the real one says how tall it is
  out = once(
    out,
    '<div style="height:100%;box-sizing:border-box;display:flex;flex-direction:column;' +
      'padding-top:62px;background:var(--color-bg);color:var(--color-text);' +
      'font-family:var(--font-body)">',
    '<div style="flex:1;min-height:0;width:100%;box-sizing:border-box;display:flex;' +
      'flex-direction:column;padding-top:max(14px, env(safe-area-inset-top));' +
      'background:var(--color-bg);color:var(--color-text);font-family:var(--font-body)">',
    "app shell",
  );

  // olive is the backdrop the site's frame sits on. In the app nothing sits on
  // it except an over-scrolled list, bouncing back against a green wall
  out = once(
    out,
    "body{margin:0;background:#8e9a48;",
    "body{margin:0;background:var(--color-bg);",
    "page background",
  );

  // and the tab bar clears the home indicator, so a swipe up does not land on
  // whichever tab happens to sit under it
  return once(
    out,
    "background:var(--color-bg);padding:6px 8px 2px\">",
    "background:var(--color-bg);padding:6px 8px max(2px, env(safe-area-inset-bottom))\">",
    "tab bar",
  );
}

export function applyLayoutBehavior(template: string): string {
  return fillTheScreen(
    respectSafeAreas(
      sayEarnedNotKept(reserveScrollbarGutter(fieldsCanShrink(clampGridColumns(template)))),
    ),
    isNativeApp(),
  );
}
