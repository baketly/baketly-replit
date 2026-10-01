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
// What it presses is the app's own hidden back button, so going back by
// gesture and going back by tapping are the same action taking the same path
// through the app's state. Nothing here knows which screen is showing.

/** where a drag has to start to count as an edge swipe */
const EDGE_PX = 28;
/** how far before the screen starts moving at all: below this it is a tap */
const WAKE_PX = 8;
/** and how much straighter than it is tall, before it is a scroll */
const DIRECTION_RATIO = 1.2;
/** past this share of the screen, letting go completes the journey */
const COMMIT_SHARE = 0.4;
/** or this fast, however far it got: a flick counts */
const FLICK_PX_PER_MS = 0.5;

const OUT_MS = 165;
const IN_MS = 190;
const SPRING_BACK_MS = 190;
/** the phone's own curve: quick to leave, gentle to arrive */
const EASE = "cubic-bezier(.22,.61,.36,1)";

interface Drag {
  x: number;
  y: number;
  at: number;
  /** set once the drag has proved itself horizontal; before that, undecided */
  engaged: boolean;
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
function ghostOf(el: HTMLElement, startX: number): HTMLElement {
  const box = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  for (const node of Array.from(ghost.querySelectorAll("[id]"))) node.removeAttribute("id");

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
  ghost.style.background = getComputedStyle(document.body).backgroundColor || "#faf6f0";
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
 * Finish the journey: the screen behind arrives at once, the copy leaves.
 *
 * Both move together, which is the whole of the effect. The one arriving
 * starts slightly to the left and settles, the way a phone moves the screen
 * underneath; the copy carries on from wherever the finger left it.
 */
function finish(el: HTMLElement, from: number): void {
  if (reducedMotion()) {
    clear(el);
    goBack();
    return;
  }

  const ghost = ghostOf(el, from);

  // the real screen is free to become the previous one straight away
  clear(el);
  goBack();
  put(el, "translateX(-22%)", 0);
  void el.offsetWidth;
  put(el, "translateX(0)", IN_MS);

  // and the copy goes, over the top of it
  void ghost.offsetWidth;
  ghost.style.transition = `transform ${OUT_MS}ms ${EASE}`;
  ghost.style.transform = "translateX(100%)";

  window.setTimeout(() => ghost.remove(), OUT_MS + 40);
  window.setTimeout(() => clear(el), IN_MS + 20);
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

  const letGo = () => {
    const el = sliding();
    if (drag?.engaged && el) springBack(el);
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
      drag =
        touch.clientX <= EDGE_PX && canGoBack()
          ? { x: touch.clientX, y: touch.clientY, at: Date.now(), engaged: false }
          : null;
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

      if (!started.engaged) {
        // still deciding: a drag that goes down before it goes across is a
        // scroll, and this gets out of its way for the rest of the gesture
        if (strayed > WAKE_PX && strayed >= travelled) {
          drag = null;
          return;
        }
        if (travelled < WAKE_PX || travelled < strayed * DIRECTION_RATIO) return;
        started.engaged = true;
        const engagedEl = sliding();
        if (engagedEl) {
          engagedEl.style.willChange = "transform";
          engagedEl.style.transition = "none";
        }
      }

      const el = sliding();
      if (!el) return;
      // never to the left: this gesture only ever goes one way
      const x = Math.max(0, travelled);
      event.preventDefault();
      el.style.transform = `translateX(${x}px)`;
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const started = drag;
      drag = null;
      if (!started?.engaged) return;

      const el = sliding();
      if (!el) return;

      const touch = event.changedTouches[0];
      if (!touch) {
        springBack(el);
        return;
      }

      const travelled = Math.max(0, touch.clientX - started.x);
      const elapsed = Math.max(1, Date.now() - started.at);
      const far = travelled >= window.innerWidth * COMMIT_SHARE;
      const flicked = travelled / elapsed >= FLICK_PX_PER_MS && travelled > WAKE_PX * 4;

      if (far || flicked) finish(el, travelled);
      else springBack(el);
    },
    { passive: true },
  );

  document.addEventListener("touchcancel", letGo, { passive: true });
}
