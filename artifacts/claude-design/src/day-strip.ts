// Keeping the home screen's row of days where the baker left it.
//
// The row scrolls sideways: last week, today, two weeks ahead. Two things
// about the generated page make that harder than it sounds. It opens with
// today at the left, which means scrolling the row before anyone touches it;
// and the page redraws itself on every change of state -- ticking a to-do,
// picking a day -- which can hand back a fresh row sitting at scroll zero,
// showing last Thursday to a baker who was looking at next Tuesday.
//
// So the row's position is remembered from its own scroll events and put
// back whenever a new row appears, and the first row of a session is placed
// on today. The injected controller reaches the "back to today" scroll
// through a global, the same way the rest of the app's code is reached.

/** how many days the row holds before today; the controller draws the same number */
const DAYS_BEFORE_TODAY = 7;

declare global {
  interface Window {
    __baketlyDayStripToday: () => void;
  }
}

let remembered: number | null = null;

function strip(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-bk-days]");
}

/** One day's width including the gap after it, read off the row itself. */
function stride(row: HTMLElement): number {
  const first = row.children[0] as HTMLElement | undefined;
  const second = row.children[1] as HTMLElement | undefined;
  if (!first) return 0;
  if (!second) return first.getBoundingClientRect().width;
  return second.getBoundingClientRect().left - first.getBoundingClientRect().left;
}

function todayLeft(row: HTMLElement): number {
  return Math.round(stride(row) * DAYS_BEFORE_TODAY);
}

/**
 * Put the row where it belongs. Says whether it could.
 *
 * The home screen's markup is in the page before the home screen is shown --
 * behind onboarding, behind sign-in -- and a row that is not laid out yet
 * measures every day at zero wide. Placing it then puts it at zero and calls
 * the job done, and the baker's first sight of it is last Thursday. So a row
 * with no width is left alone, and asked again on the next change.
 */
function place(row: HTMLElement): boolean {
  if (stride(row) <= 0) return false;
  row.scrollLeft = remembered ?? todayLeft(row);
  return true;
}

/** how long after a finger lands on the row its scrolling counts as the baker's */
const TOUCH_WINDOW_MS = 2_500;

export function keepDayStripInPlace(): void {
  // Only a scroll the baker caused is worth remembering. The page redrawing
  // the row puts it back at zero, and that fires a scroll event too -- which
  // was being taken as the baker's choice, and the row then opened on last
  // Thursday every time. A scroll counts when a finger (or a wheel) was on
  // the row a moment before it.
  let touchedAt = 0;
  const touched = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-bk-days]")) touchedAt = Date.now();
  };
  document.addEventListener("touchstart", touched, { capture: true, passive: true });
  document.addEventListener("pointerdown", touched, { capture: true, passive: true });
  document.addEventListener("wheel", touched, { capture: true, passive: true });

  // scroll does not bubble, but it can be heard on the way down
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.hasAttribute("data-bk-days") &&
        Date.now() - touchedAt < TOUCH_WINDOW_MS
      ) {
        remembered = target.scrollLeft;
      }
    },
    true,
  );

  // the row that has been placed, and only once it really was
  let placed: HTMLElement | null = null;
  const settle = () => {
    const row = strip();
    if (!row) {
      placed = null;
      return;
    }
    // A row already placed can still be knocked back to zero when the page
    // redraws its days, so it is held where it should be after every change
    // to the page, not only when it first appears.
    const wanted = remembered ?? todayLeft(row);
    if (row === placed && Math.abs(row.scrollLeft - wanted) <= 2) return;
    // after layout, so the widths are real; a row still hidden is left for
    // the next change to the page, when it may have appeared
    requestAnimationFrame(() => {
      if (place(row)) placed = row;
    });
  };
  // Watched from the document itself. This runs before the app has drawn
  // anything, and the generated runtime draws the app by replacing the whole
  // <html> element -- an observer on the body, or on <html>, dies with the
  // node it watched. The Document node is never replaced. The tick below
  // stays as a belt to those braces: settle returns at once when the row is
  // where it should be, so it costs a lookup and a comparison.
  const observer = new MutationObserver(settle);
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  window.setInterval(settle, 500);
  settle();

  window.__baketlyDayStripToday = () => {
    remembered = null;
    const row = strip();
    if (row) row.scrollTo({ left: todayLeft(row), behavior: "smooth" });
  };
}
