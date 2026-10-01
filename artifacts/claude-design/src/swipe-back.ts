// The edge swipe, as iOS and WhatsApp do it.
//
// A drag that starts at the very left edge and travels right means "go back"
// on a phone, and a baker who has just opened a recipe expects it to work
// without hunting for the small arrow at the top of the screen.
//
// The screen follows the finger while the drag is happening, rather than
// nothing happening until the finger lifts. That is most of what makes the
// gesture feel like the phone's own: you can see how far you have come, you
// can see it is going to work, and you can change your mind and watch it go
// back. Letting go past the halfway mark finishes it; letting go short of
// that returns the screen to where it was.
//
// On a tab there is nothing to go back to, and the same movement is used to
// step sideways instead: Analytics has Overview, Products and Events, and a
// horizontal drag moves between them. That one takes the finger from anywhere
// on the screen rather than the edge, which is how a row of tabs is swiped
// everywhere else.
//
// What it presses is the app's own hidden back button, or the app's own tab,
// so going by gesture and going by tapping are the same action taking the same
// path through the app's state. Nothing here knows which screen is showing.

/**
 * Whether a sideways drag on Analytics changes tab.
 *
 * Off. It got close -- the pane follows the finger, a relaxed swipe lands,
 * the mark moves with the content -- and in the hand it still was not right,
 * and a navigation gesture that is nearly right is worse than a tap that is.
 * The machinery below is kept so this is one word to turn back on; the tabs
 * themselves are tapped meanwhile, which has always worked.
 */
const TAB_SWIPE = false;

/** where a drag has to start to count as an edge swipe */
const EDGE_PX = 28;
/** how far before the screen starts moving at all: below this it is a tap */
const WAKE_PX = 8;
/** and how much straighter than it is tall, before it is a scroll */
const DIRECTION_RATIO = 1.2;
/** past this share of the screen, letting go completes the journey */
const COMMIT_SHARE = 0.4;
/**
 * And this share of the pane, to land on the next tab.
 *
 * A fifth, measured against the pane rather than the window. Half a screen
 * was most of a phone, and an unhurried swipe from the middle of the pane
 * cannot cover it before running out of screen: the tab sprang back, and
 * changing tab took a second, bigger swipe. A pager is swiped idly, with a
 * thumb, and this is about what the ones that feel right ask for.
 */
const TAB_COMMIT_SHARE = 0.22;
/**
 * Or this fast over the last moment of the drag, however far it got.
 *
 * Measured over the end of the movement rather than the whole touch. Taken
 * from the first contact it is an average, and a finger that rests before it
 * swipes drags that average under the bar however briskly it then moves --
 * which is a swipe that plainly happened being read as no swipe at all.
 */
const FLICK_PX_PER_MS = 0.2;
/** and far enough that a twitch is not a flick */
const FLICK_MIN_PX = 24;
/** how far back "the last moment" reaches */
const FLICK_WINDOW_MS = 45;

const OUT_MS = 165;
const IN_MS = 190;
/** sideways, where the two tabs move as one piece and so share a duration */
const TAB_MS = 230;
const SPRING_BACK_MS = 190;
/** the phone's own curve: quick to leave, gentle to arrive */
const EASE = "cubic-bezier(.22,.61,.36,1)";

/** going back out of a screen, or sideways between tabs on one */
type Kind = "back" | "tabs";

interface Drag {
  x: number;
  y: number;
  at: number;
  kind: Kind;
  /** set once the drag has proved itself horizontal; before that, undecided */
  engaged: boolean;
  /** the latest position, and the one from a moment before it */
  lastX: number;
  lastAt: number;
  prevX: number;
  prevAt: number;
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

/**
 * The back control on the screen, if it has drawn one.
 *
 * Every pushed screen carries a link reading ‹ and the name of where it
 * came from. Pressing that is exactly what a tap does, including the screens
 * whose back does more than pop a stack — a half-finished edit is discarded,
 * a draft cleared. Reaching past it to the stack would skip all of that.
 */
function backControl(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll("button"));
  const own = buttons.find((button) => {
    const text = (button.textContent || "").trim();
    return text.startsWith("‹") && button.offsetParent !== null;
  });
  return own ?? null;
}

function hiddenBack(): HTMLElement | null {
  return document.getElementById("bk-back");
}

/**
 * Whether there is anywhere to go.
 *
 * A tab is the foot of its own stack, so back on one means nothing, and the
 * screen should not move at all rather than slide and spring back against
 * nothing. The depth is written onto the hidden button by the controller.
 */
function canGoBack(): boolean {
  if (backControl()) return true;
  const depth = Number(hiddenBack()?.getAttribute("data-depth") || "0");
  return depth > 0;
}


/**
 * The row of tabs on the screen, if it has one, and which is showing.
 *
 * Analytics draws Overview, Products and Events as its own controls, with the
 * showing one marked. Pressing one is what a tap does; this only finds them.
 */
function subTabs(): { list: HTMLElement[]; index: number } | null {
  const list = Array.from(document.querySelectorAll<HTMLElement>(".an-tab")).filter(
    (tab) => tab.offsetParent !== null,
  );
  if (list.length < 2) return null;
  const index = list.findIndex((tab) => tab.classList.contains("active"));
  return index === -1 ? null : { list, index };
}

/**
 * Whether the finger landed on something that scrolls sideways itself.
 *
 * A wide table or a chart that runs off the screen is dragged horizontally to
 * read it, and that has to keep working: a gesture that stole those drags
 * would make the content unreadable to fix the navigation.
 */
function insideSideScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const scrolls = style.overflowX === "auto" || style.overflowX === "scroll";
    if (scrolls && node.scrollWidth > node.clientWidth + 2) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * The tab a drag in this direction would reach, if there is one.
 *
 * Left goes to the next, right to the one before. At either end of the row
 * this is nothing, and the screen should not move at all: dragging past the
 * last tab showed the empty space beyond it, which is a promise the row
 * cannot keep.
 */
function tabInDirection(moved: number): HTMLElement | undefined {
  const tabs = subTabs();
  if (!tabs) return undefined;
  return tabs.list[tabs.index + (moved < 0 ? 1 : -1)];
}

function goBack(): void {
  // the screen's own back first, and the controller stack only if it has none
  const own = backControl();
  if (own) {
    own.click();
    return;
  }
  hiddenBack()?.click();
}

/**
 * What slides.
 *
 * The scrolling body, which is the part of the screen that changes; the tab
 * bar below it stays put, the way it does on a phone. The hidden back button
 * is injected as its first child, which makes it the one element on the page
 * that can be found without knowing anything about the design.
 */
function sliding(): HTMLElement | null {
  return hiddenBack()?.parentElement ?? null;
}

/**
 * The part a tab swipe moves: everything under the row of tabs, and nothing
 * above it.
 *
 * Going back takes the whole screen, because the whole screen is what
 * changes. Changing tab does not change the heading or the tabs themselves,
 * and dragging those along made the swipe look like the page escaping rather
 * than the pane under the tabs turning over.
 */
function tabPane(): HTMLElement | null {
  const pane = document.querySelector<HTMLElement>(".an-pane");
  return pane && pane.offsetParent !== null ? pane : null;
}

/** What this drag has hold of. */
function movingFor(kind: Kind): HTMLElement | null {
  return kind === "tabs" ? tabPane() ?? sliding() : sliding();
}

/**
 * Stop a pane that is held off to one side from widening the page.
 *
 * The pane is moved a whole width sideways while the drag is on, and the body
 * it sits in scrolls, so without this it gains that width as somewhere to
 * scroll to: the page can be dragged sideways into the empty space the pane
 * left behind. Vertical scrolling is untouched, and it is put back as it was
 * when the gesture ends.
 */
function holdWidth(on: boolean): void {
  const body = sliding();
  if (!body) return;
  body.style.overflowX = on ? "hidden" : "";
}

function put(el: HTMLElement, transform: string, ms: number): void {
  el.style.transition = ms > 0 ? `transform ${ms}ms ${EASE}` : "none";
  el.style.transform = transform;
}

function clear(el: HTMLElement): void {
  el.style.transition = "";
  el.style.transform = "";
  el.style.willChange = "";
}

/**
 * A copy of the screen as it looks right now, to slide away on its own.
 *
 * The app draws one screen at a time, so going back replaces what is on the
 * page: slide first and the space behind is empty, swap first and the screen
 * you were on vanishes before it has left. Neither is what a phone does.
 *
 * Copying the outgoing screen onto a layer of its own settles it. The app can
 * then swap underneath immediately -- so the screen you are going back to is
 * there, in place, for the whole movement -- while the copy slides off the top
 * of it. It is a picture, not a screen: nothing in it can be scrolled or
 * tapped, and it is thrown away when it has gone.
 */
/**
 * The colour actually behind an element: its own, or the nearest one above it
 * that is not see-through. A copy laid over the live screen has to be opaque
 * or both are legible at once, and the body's colour is not always the
 * screen's -- in a browser the app sits in a frame on a page of another colour.
 */
function opaqueBackgroundBehind(el: HTMLElement): string {
  let node: HTMLElement | null = el;
  while (node) {
    const colour = getComputedStyle(node).backgroundColor;
    if (colour && colour !== "transparent" && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(colour)) {
      return colour;
    }
    node = node.parentElement;
  }
  return "#faf6f0";
}

/** Counts the copies made, so each gesture can tidy only its own. */
let ghostSerial = 0;

function ghostOf(el: HTMLElement, startX: number): HTMLElement {
  const box = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  for (const node of Array.from(ghost.querySelectorAll("[id]"))) node.removeAttribute("id");

  // Numbered, not just marked. Tidying up used to sweep every copy on the
  // page, which took the copies a gesture starting a moment later had just
  // made with it, and that gesture then had nothing to move.
  ghostSerial += 1;
  ghost.dataset.bkGhost = String(ghostSerial);
  ghost.style.position = "fixed";
  ghost.style.left = box.left + "px";
  ghost.style.top = box.top + "px";
  ghost.style.width = box.width + "px";
  ghost.style.height = box.height + "px";
  ghost.style.margin = "0";
  ghost.style.zIndex = "9999";
  ghost.style.pointerEvents = "none";
  ghost.style.overflow = "hidden";
  // the body it was cut from is see-through; over the screen beneath it has
  // to be opaque or both are legible at once
  ghost.style.background = opaqueBackgroundBehind(el);
  ghost.style.transform = `translateX(${startX}px)`;
  ghost.style.transition = "none";
  // and keep it looking exactly as it did, scrolled to wherever it was
  ghost.scrollTop = el.scrollTop;
  document.body.appendChild(ghost);
  // a clone cannot be scrolled by the viewer, but it can be drawn scrolled
  ghost.scrollTop = el.scrollTop;
  return ghost;
}

/**
 * Finish the movement: what arrives is there at once, the copy leaves.
 *
 * Both move together, which is the whole of the effect. Going back, the
 * arriving screen starts slightly to the left and settles, the way a phone
 * moves the screen underneath. Going sideways it comes the whole way in from
 * the side the finger came from, because neither tab is under the other.
 */
function slide(
  el: HTMLElement,
  from: number,
  change: () => void,
  outTo: string,
  inFrom: string,
): void {
  if (reducedMotion()) {
    clear(el);
    change();
    return;
  }

  const ghost = ghostOf(el, from);

  // the real screen is free to become the next one straight away
  clear(el);
  change();
  put(el, `translateX(${inFrom})`, 0);
  void el.offsetWidth;
  put(el, "translateX(0)", IN_MS);

  // and the copy goes, over the top of it
  void ghost.offsetWidth;
  ghost.style.transition = `transform ${OUT_MS}ms ${EASE}`;
  ghost.style.transform = `translateX(${outTo})`;

  window.setTimeout(() => ghost.remove(), OUT_MS + 40);
  window.setTimeout(() => clear(el), IN_MS + 20);
}

/**
 * The two tabs, side by side under the finger.
 *
 * A tab swipe shows both: the one leaving and the one arriving travel
 * together, the whole time, so the next tab is visible from the first
 * millimetre of the drag rather than appearing when it is over. That is the
 * difference between a screen that is being dragged and one that merely
 * reacts to having been dragged.
 *
 * Both halves are copies, and the live pane is never moved. That is the whole
 * of the design, and the earlier version got it wrong.
 *
 * Before, the arriving half WAS the live pane: switched at the start of the
 * drag and then dragged about. Everything rested on one element being changed
 * and animated at once, and a re-draw landing in the middle of that pulled the
 * two apart -- the tab reading as changed with the pane left behind. Reported
 * three times from the phone and never once reproducible here, which is what a
 * timing fault looks like from the machine it happens to go right on.
 *
 * So nothing is asked of the live pane. The tab is changed once, which draws
 * the destination into the pane at rest where it belongs, and two copies are
 * laid over the top to do the moving. When they are taken away, what is
 * underneath is whatever tab is active, sitting where it always was.
 *
 * The pane and the tab cannot disagree, because nothing here is capable of
 * putting them out of step.
 */
interface Pair {
  /** a copy of the tab the finger started on */
  leaving: HTMLElement;
  /**
   * A copy of the tab being dragged into view, once there is one.
   *
   * Null for the first frame or two. The app needs a moment to draw the tab
   * being moved to, and waiting for it before anything moved left the start
   * of every swipe stuck to the screen: the finger went and the pane did not
   * follow until it was already a third of the way across. The copy of the
   * tab being left is made at once and moves immediately; this one joins it,
   * in the right place, as soon as there is something to copy.
   */
  arriving: HTMLElement | null;
  /**
   * A copy of the row of tabs, showing the tab the finger started on.
   *
   * The app is asked to change tab the moment the drag begins, because that
   * is the only way to get the next tab's content to copy -- and the live row
   * marks the new tab at once. So the underline jumped to the next tab while
   * the pane had barely moved, and on a swipe that did not go far enough it
   * then jumped back: the tab moved and the window stayed put, which read as
   * the gesture breaking. This covers the row until the pane has landed, so
   * the mark moves when the content does.
   */
  rowGhost: HTMLElement | null;
  /** where the finger has got to, so a late arrival can catch up */
  at: number;
  /** set once the gesture is over, so a late arrival knows not to bother */
  done: boolean;
  width: number;
  /** -1 when the content moves left, towards the next tab */
  dir: -1 | 1;
  /** the control for the tab we started on, to return to if it is cancelled */
  origin: HTMLElement;
  /** the control for the tab it moved to, to tell whether we are still on it */
  target: HTMLElement;
  /** how far the ghost count had got, so a later gesture's copies survive */
  serial: number;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Wait until the tab has really changed, however long the phone takes.
 *
 * This used to wait two frames and assume. Two frames is enough on a quick
 * machine and a guess everywhere else: park the pane off to one side before
 * the app has finished drawing the new tab into it and the two come apart --
 * the tab reads as changed while the pane still shows what it showed. Asking
 * the page, rather than counting frames, holds on a slow phone and returns
 * immediately on a fast one.
 *
 * It gives up after a while rather than waiting for ever. A gesture that
 * cannot be shown is still a gesture that must end.
 */
async function waitForTab(target: HTMLElement): Promise<boolean> {
  for (let frames = 0; frames < 20; frames += 1) {
    if (target.classList.contains("active")) return true;
    await nextFrame();
  }
  return target.classList.contains("active");
}

/**
 * Take hold, now, without waiting for anything.
 *
 * Everything here is synchronous so that the pane moves on the same frame the
 * finger does. The tab is told to change in passing; what it draws is picked
 * up by fillPair a frame or two later.
 */
function beginPair(el: HTMLElement, dir: -1 | 1): Pair | null {
  const tabs = subTabs();
  if (!tabs) return null;
  const origin = tabs.list[tabs.index];
  const target = tabs.list[tabs.index + (dir < 0 ? 1 : -1)];
  if (!origin || !target) return null;

  const width = el.getBoundingClientRect().width || window.innerWidth;
  const leaving = ghostOf(el, 0);
  // and the row of tabs as it is now, over the live one, before the live one
  // is told to change
  const row = origin.parentElement;
  const rowGhost = row ? ghostOf(row, 0) : null;
  holdWidth(true);

  // The live pane becomes the destination and then is left entirely alone,
  // sitting at rest where it belongs. Nothing below moves it.
  target.click();

  return {
    leaving,
    arriving: null,
    rowGhost,
    at: 0,
    done: false,
    width,
    dir,
    origin,
    target,
    serial: ghostSerial,
  };
}

/** And the other half, as soon as the app has drawn the tab moved to. */
async function fillPair(pair: Pair): Promise<void> {
  await waitForTab(pair.target);
  await nextFrame();
  if (pair.done) return;

  const live = tabPane();
  if (!live) return;

  // a likeness of it, waiting off the side the finger is pulling from, and
  // brought straight to wherever the finger has got to in the meantime
  pair.arriving = ghostOf(live, pair.dir < 0 ? pair.width : -pair.width);
  pair.serial = ghostSerial;
  movePair(pair, pair.at);
}

/** Both of them, wherever the finger has got to. */
function movePair(pair: Pair, dx: number): void {
  pair.at = dx;
  pair.leaving.style.transition = "none";
  pair.leaving.style.transform = `translateX(${dx}px)`;
  if (!pair.arriving) return;
  const offset = pair.dir < 0 ? pair.width : -pair.width;
  pair.arriving.style.transition = "none";
  pair.arriving.style.transform = `translateX(${dx + offset}px)`;
}

/** The previous gesture's tidying up, while it is still waiting to happen. */
let settleRun: (() => void) | null = null;
let settleTimer = 0;

function closePair(pair: Pair, settled: boolean): void {
  // anything still outstanding goes first, in the order it was asked for
  finishSettling();
  pair.done = true;
  const ms = TAB_MS;
  const offset = pair.dir < 0 ? pair.width : -pair.width;

  const ease = `transform ${ms}ms ${EASE}`;
  pair.leaving.style.transition = ease;
  if (pair.arriving) pair.arriving.style.transition = ease;
  if (settled) {
    pair.leaving.style.transform = `translateX(${-offset}px)`;
    if (pair.arriving) pair.arriving.style.transform = "translateX(0)";
  } else {
    pair.leaving.style.transform = "translateX(0)";
    if (pair.arriving) pair.arriving.style.transform = `translateX(${offset}px)`;
  }

  const finish = () => {
    let reverted = false;
    if (!settled) {
      // Put the tab back the way it was, under cover of the copies -- but
      // only if it is still the tab this gesture left it on. Somebody who
      // swipes again, or taps a tab, inside the quarter second this waits has
      // already said what they want, and clicking anyway took it off them
      // again: the swipe worked, then undid itself, and it had to be done
      // twice.
      const now = subTabs();
      const stillOurs = !!now && now.list[now.index] === pair.target;
      if (stillOurs) {
        pair.origin.click();
        reverted = true;
      }
    }
    holdWidth(false);
    // And tidy after whatever the phone actually did.
    //
    // Everything above works on the elements this gesture began with, and a
    // re-draw in the middle of it can leave a different pane on the page --
    // one still holding a transform nobody will clear, or a copy nobody will
    // remove. Both would be left on screen: a pane held off to one side is a
    // tab that never arrived. So the page is put straight at the end, on
    // whatever it is showing by then.
    const sweep = () => {
      const settledPane = tabPane();
      if (settledPane && settledPane !== pair.arriving) clear(settledPane);
      // this gesture's copies and anything older, never a newer gesture's
      for (const stray of Array.from(document.querySelectorAll<HTMLElement>("[data-bk-ghost]"))) {
        if (Number(stray.dataset.bkGhost || 0) <= pair.serial) stray.remove();
      }
    };
    // Lifting the copies in the same breath as the click showed the tab that
    // was being left for a frame, before the app had drawn the old one back.
    // Two frames is what that takes here; a newer gesture's copies carry
    // higher numbers and are left alone either way.
    if (reverted) {
      requestAnimationFrame(() => requestAnimationFrame(sweep));
    } else {
      sweep();
    }
  };

  settleRun = finish;
  settleTimer = window.setTimeout(() => {
    if (settleRun === finish) finishSettling();
  }, ms + 20);
}

/**
 * Finish the last gesture's tidying up now, rather than when its timer says.
 *
 * Everything above happens under cover of the copies and a quarter second
 * after the finger has gone. A second swipe inside that quarter second used
 * to land on a screen the first one had not finished with, and the first
 * one's tail then fired underneath it. Running it the moment a new gesture
 * begins means each swipe starts from a page that has settled.
 */
function finishSettling(): void {
  const run = settleRun;
  if (!run) return;
  settleRun = null;
  window.clearTimeout(settleTimer);
  settleTimer = 0;
  run();
}

function springBack(el: HTMLElement): void {
  if (reducedMotion()) {
    clear(el);
    return;
  }
  put(el, "translateX(0)", SPRING_BACK_MS);
  window.setTimeout(() => clear(el), SPRING_BACK_MS + 20);
}

/**
 * Listens for the gesture, for as long as the app is open.
 *
 * touchmove is the one listener that is not passive, and it stops the page
 * only once the drag has proved itself an edge swipe — started at the edge,
 * moved further across than down. Until then it does nothing and a scroll
 * behaves exactly as it always did.
 */
export function listenForSwipeBack(): void {
  let drag: Drag | null = null;
  /** the two tabs, while a sideways drag has them open */
  let pair: Pair | null = null;
  const letGo = () => {
    if (pair) {
      closePair(pair, false);
      pair = null;
    } else if (drag?.engaged) {
      const el = movingFor(drag.kind);
      if (el) springBack(el);
    }
    drag = null;
  };

  document.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) {
        drag = null;
        return;
      }

      // Settle the last one before starting this one. A finger coming back
      // down inside a quarter second found a screen mid-tidy, and the tidying
      // then ran underneath the new gesture -- which is what made a tab
      // change take two swipes.
      finishSettling();

      const begin = (kind: Kind): Drag => ({
        x: touch.clientX,
        y: touch.clientY,
        at: Date.now(),
        kind,
        engaged: false,
        lastX: touch.clientX,
        lastAt: Date.now(),
        prevX: touch.clientX,
        prevAt: Date.now(),
      });

      // Going back wins where both could apply: it is the gesture people
      // already have in their hands, and it only ever starts at the edge.
      if (touch.clientX <= EDGE_PX && canGoBack()) {
        drag = begin("back");
        return;
      }
      if (TAB_SWIPE && subTabs() && !insideSideScroller(event.target)) {
        drag = begin("tabs");
        return;
      }
      drag = null;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      const started = drag;
      if (!started) return;
      const touch = event.touches[0];
      if (!touch) return;

      const travelled = touch.clientX - started.x;
      const strayed = Math.abs(touch.clientY - started.y);

      // keep a sample from a moment ago, to read the speed at the end from
      const now = Date.now();
      if (now - started.lastAt >= FLICK_WINDOW_MS) {
        started.prevX = started.lastX;
        started.prevAt = started.lastAt;
        started.lastX = touch.clientX;
        started.lastAt = now;
      }

      // going back is one way only; between tabs either way counts
      const across = started.kind === "back" ? travelled : Math.abs(travelled);

      if (!started.engaged) {
        // still deciding: a drag that goes down before it goes across is a
        // scroll, and this gets out of its way for the rest of the gesture
        if (strayed > WAKE_PX && strayed >= across) {
          drag = null;
          return;
        }
        if (across < WAKE_PX || across < strayed * DIRECTION_RATIO) return;
        started.engaged = true;
        const engagedEl = movingFor(started.kind);
        if (engagedEl) {
          engagedEl.style.willChange = "transform";
          engagedEl.style.transition = "none";
        }

        // Sideways: bring the next tab alongside, now, so the rest of the
        // drag moves the two of them together. Nothing happens where the row
        // has run out -- the screen stays put rather than pulling open on
        // nothing.
        if (started.kind === "tabs" && engagedEl && !pair) {
          const dir: -1 | 1 = travelled < 0 ? -1 : 1;
          if (tabInDirection(travelled)) {
            pair = beginPair(engagedEl, dir);
            if (pair) void fillPair(pair);
          }
        }
      }

      event.preventDefault();

      // once the two tabs are side by side they move as the one thing
      if (pair) {
        movePair(pair, travelled);
        return;
      }

      const el = movingFor(started.kind);
      if (!el) return;
      // back never goes left; between tabs nothing moves until the pair is
      // ready, and nothing moves at all where the row has run out
      if (started.kind === "tabs") return;
      el.style.transform = `translateX(${Math.max(0, travelled)}px)`;
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const started = drag;
      drag = null;
      const open = pair;
      pair = null;

      if (!started?.engaged) {
        if (open) closePair(open, false);
        return;
      }

      const el = movingFor(started.kind);
      if (!el) {
        if (open) closePair(open, false);
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) {
        if (open) closePair(open, false);
        else springBack(el);
        return;
      }

      const moved = touch.clientX - started.x;
      const across = started.kind === "back" ? Math.max(0, moved) : Math.abs(moved);
      const share = started.kind === "back" ? COMMIT_SHARE : TAB_COMMIT_SHARE;
      // Against the pane for a tab, the window for going back. The pane is
      // what is actually being pushed aside, and on a screen where it is
      // narrower than the window, a share of the window is a distance the
      // pane never has to travel.
      const span =
        started.kind === "back"
          ? window.innerWidth
          : open?.width || el.getBoundingClientRect().width || window.innerWidth;
      const far = across >= span * share;

      // The speed it was going when it let go, not its average since being
      // put down. A swipe starting mid-screen cannot travel half a screen
      // before running out of screen, so this is what carries most of them.
      const window_ms = Math.max(1, Date.now() - started.prevAt);
      const speed = Math.abs(touch.clientX - started.prevX) / window_ms;
      const flicked =
        speed >= FLICK_PX_PER_MS &&
        across > FLICK_MIN_PX &&
        // and still going the way it set off
        (started.kind === "back" || Math.sign(touch.clientX - started.prevX) === Math.sign(moved));

      // Sideways, with the next tab alongside: let it arrive, or send it
      // back. Either way the two finish the movement together, and the copy
      // of the arriving tab catches up on its own if it is not here yet.
      if (open) {
        closePair(open, far || flicked);
        return;
      }

      if (!far && !flicked) {
        springBack(el);
        return;
      }

      if (started.kind === "back") {
        slide(el, moved, goBack, "100%", "-22%");
        return;
      }

      // a sideways drag with no pair behind it reached the end of the row
      springBack(el);
    },
    { passive: true },
  );

  document.addEventListener("touchcancel", letGo, { passive: true });
}
