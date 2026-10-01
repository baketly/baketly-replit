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
      // Two earlier goes at this were wrong in opposite directions. A
      // breakpoint stacked them correctly in a 375px browser and still drew
      // the fee over the date on the phone — a media query is only as honest
      // as the width the device reports. Then a wrapping row with a 220px
      // floor never overlapped, but wrapped on every phone, which is not what
      // a date and a fee should do: they belong side by side, and they are
      // short enough to be.
      //
      // So: two tracks that always sit on one line, the date given the larger
      // share because a formatted date is the wider thing by far, and the fee
      // only ever a symbol and a number.
      //
      // Overlapping is then made impossible rather than avoided. minmax(0,…)
      // lets a track go under its content's own idea of a minimum, min-width:0
      // lets the control follow it, and overflow:hidden on the field means
      // that even where iOS insists on more room for its date control than the
      // track allows, it is clipped at its own edge instead of painting across
      // its neighbour. A clipped date is legible and obviously tight; a date
      // with a fee written over it is neither.
      // 1.62 to 1 was chosen when the date was thought to be short of room.
      // It was not: measured on the phone, "1 Oct 2026" sat in a 184px box
      // with its border closing cleanly, and the booth fee got whatever was
      // left -- about 100px, once the currency symbol had taken its share.
      // The fee was the cramped one, and the date is what had the slack.
      //
      // Closer to even, and a wider gutter between them. A date reads fine in
      // 165px; a fee crushed into 100px next to a 184px date is what looks
      // like two fields fighting.
      "\n    .bk-pair{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px}" +
      "\n    .bk-pair>*{min-width:0;overflow:hidden}" +
      // max-width alone does not hold a date input.
      //
      // iOS renders type="date" as a native control with an intrinsic width of
      // its own, and max-width does not override that: measured in a 189.8px
      // column, the control stayed 230px and its right edge landed 30px PAST
      // the booth fee beside it. That is the overlap, and it is why widening
      // the date column never helped -- the date was never the thing in the
      // way of itself. overflow:hidden above was clipping the evidence, taking
      // the right border and the calendar icon off and leaving a box that
      // merely looked cut off.
      //
      // width:100% makes the column the authority instead of the control.
      "\n    .bk-pair .input{width:100%;min-width:0;max-width:100%;box-sizing:border-box}",
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
