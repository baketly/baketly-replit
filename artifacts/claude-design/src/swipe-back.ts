// The edge swipe, as iOS does it.
//
// A drag that starts at the very left edge and travels right means "go back"
// on a phone, and a baker who has just opened a recipe expects it to work
// without hunting for the small arrow at the top of the screen.
//
// What it presses is the app's own hidden back button, so going back by
// gesture and going back by tapping are the same action taking the same path
// through the app's state. Nothing here knows which screen is showing.

/** where a drag has to start to count as an edge swipe */
const EDGE_PX = 28;
/** how far it has to travel before it means anything */
const DISTANCE_PX = 70;
/** and how much straighter than it is tall */
const DIRECTION_RATIO = 1.6;
/** a swipe is a quick thing; a slow drag is a scroll that changed its mind */
const TIME_LIMIT_MS = 800;

interface Drag {
  x: number;
  y: number;
  at: number;
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

function goBack(): void {
  // the screen's own back first, and the controller stack only if it has none
  const own = backControl();
  if (own) {
    own.click();
    return;
  }
  document.getElementById("bk-back")?.click();
}

/**
 * Listens for the gesture, for as long as the app is open.
 *
 * Passive listeners throughout: this never prevents a scroll, so a horizontal
 * carousel or a slider keeps working and the worst case is that the gesture
 * does not fire.
 */
export function listenForSwipeBack(): void {
  let drag: Drag | null = null;

  document.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) {
        drag = null;
        return;
      }
      // only from the edge: anywhere else is the page's own business
      drag = touch.clientX <= EDGE_PX ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const started = drag;
      drag = null;
      if (!started) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const travelled = touch.clientX - started.x;
      const strayed = Math.abs(touch.clientY - started.y);
      const quick = Date.now() - started.at <= TIME_LIMIT_MS;
      const far = travelled >= DISTANCE_PX;
      const straight = travelled >= strayed * DIRECTION_RATIO;

      if (quick && far && straight) goBack();
    },
    { passive: true },
  );

  document.addEventListener("touchcancel", () => {
    drag = null;
  }, { passive: true });
}
