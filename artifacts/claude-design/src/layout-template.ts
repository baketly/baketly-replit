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

const CLAMPED = "minmax(0,1fr)";
// a sentinel no stylesheet would ever contain
const PARK = String.fromCharCode(1) + "clamped" + String.fromCharCode(1);

/**
 * Grid tracks that can shrink, wherever a grid is declared.
 *
 * `1fr` is shorthand for minmax(auto, 1fr), and that `auto` floor is the
 * min-content width of whatever sits in the column. An <input> with no size
 * attribute reports about 205px, and a date input on iOS rather more — so a
 * row declared `1fr 100px` asks for more width than a phone has, and the
 * second column is drawn over the first. That is the booth fee sitting on
 * top of the market date.
 *
 * Every `1fr` in every grid is clamped, rather than a list of known rows:
 * this same fault has been fixed twice already in different screens, and any
 * grid added tomorrow would arrive carrying it.
 */
function clampGridColumns(template: string): string {
  const declaration = /grid-template-columns:([^;\"'}]+)/g;
  let seen = 0;

  const out = template.replace(declaration, (whole, columns: string) => {
    seen++;
    // a track already written minmax(0,1fr) is parked, so its own 1fr is not
    // wrapped a second time
    const parked = columns.split(CLAMPED).join(PARK);
    // the separator before the track is kept: eating it would join two
    // columns into one
    const track = /(^|[\s,(])1fr(?=$|[\s,)])/g;
    const clamped = parked.replace(track, (_match, before: string) => before + CLAMPED);
    if (clamped === parked) return whole;
    return "grid-template-columns:" + clamped.split(PARK).join(CLAMPED);
  });

  // Nothing needing a clamp is a fine outcome: earlier passes replace whole
  // screens and already write their grids this way. No grid at all is not —
  // the generated page is built of them, and finding none means this is no
  // longer the page the transform was written for.
  if (!seen) throw new Error("No grid declarations found");
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
      ".field>.input{width:100%;min-width:0}" +
      // And every other control, wherever it sits. A form control's
      // min-content width is its intrinsic size — around 205px for a bare
      // <input> — and that floor holds even under flex:1. On the payment
      // screen the receipt box and its button are a flex row: 205px plus a
      // button is wider than a phone, so the screen ran off the side. This
      // only removes a floor; nothing gets narrower than its content needs.
      "input,select,textarea{min-width:0}" +
      // A date and a booth fee, on one line, on a phone.
      //
      // Back to the layout this row started with -- two shares, the date
      // the larger of them -- with one addition: the date is held to a
      // size, rather than left to ask for whatever it likes.
      //
      // The reason for the addition is that on iOS this is not a text box.
      // It is the system date widget, drawing "1 Oct 2026" where a desktop
      // browser draws "01/10/2026" with a calendar button, and it carries
      // its own idea of how wide it should be. Every attempt to arrange
      // this row by giving the column a share was arranging something that
      // sizes itself, which is why the fee kept being sat on.
      //
      // 140px fits the date iOS writes with room to spare, and is small
      // enough to leave the fee a usable half of a phone screen. A cap
      // rather than a width: on a wider screen the share still governs.
      "\n    .bk-pair{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(0,1fr);gap:10px}" +
      "\n    .bk-pair>*{min-width:0;overflow:hidden}" +
      "\n    .bk-pair .input{max-width:100%}" +
      "\n    .bk-pair>*:first-child .input{max-width:140px}",
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

  // iOS zooms the whole page in when a field's text is smaller than 16px, so
  // the keyboard can be read — and it does not reliably zoom back out. The
  // app came back from its first sign-in magnified, needing to be dragged
  // around to be read. Every control is given the size that stops it.
  const styleAnchor = "    .bk-row:active{background:rgba(60,55,30,.05)}";
  if (!out.includes(styleAnchor)) throw new Error("Missing style anchor for field sizes");
  out = out.replace(
    styleAnchor,
    () =>
      styleAnchor +
      "\n    input,select,textarea,.input{font-size:16px !important}" +
      // A button that names no colour of its own is drawn in the system colour,
      // and in a web view that is iOS blue — which is why “Single sale” and
      // “Attach to event” read blue on the phone and black everywhere else.
      // Inheriting puts them back to the page’s ink. Any button that does name
      // a colour, by class or inline, still wins over this.
      "\n    button{color:inherit}",
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
