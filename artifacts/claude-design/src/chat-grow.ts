// The chat's box, as tall as what is in it -- and the chat held at its foot.
//
// A box one line tall hides a long question while it is being asked. Dictating
// is the worst of it: the words arrive faster than they can be read, scroll
// out of sight to the left, and the baker sends something they never saw. So
// the box grows with its content, to about five lines, and scrolls after that.
//
// Height is not something the markup can say -- it depends on the text -- and
// the page redraws the box on every change of state, handing back a fresh
// element at its default height. So it is measured and set here, from the
// document itself: the generated runtime draws the app by replacing the whole
// <html> element, and an observer on a node inside it dies with the node.
//
// The first version measured by collapsing the box to nothing and reading how
// tall it wanted to be -- on every tick. Each collapse made the page shorter
// for an instant, the scroller clamped its position upward, and the box came
// back below the fold: mid-dictation the Send button leapt out from under the
// finger. Nothing here shrinks the box to find out anything any more, and a
// chat the baker is reading at the bottom is kept at the bottom through every
// redraw, the way a chat behaves.

/** past this the box scrolls instead of growing; the same figure as the CSS */
const TALLEST = 124;

/** closer than this to the foot counts as reading the newest messages */
const NEAR_BOTTOM = 80;

/** how long after a finger lands on the chat its scrolling counts as the baker's */
const TOUCH_WINDOW_MS = 2_500;

function box(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>("textarea[data-bk-chatbox]");
}

/** the nearest thing above the box that scrolls: the phone's content area */
function scrollerOf(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el && el !== document.documentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === "auto" || overflow === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

function gapToBottom(scroller: HTMLElement): number {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
}

// what the box last was, so a redrawn one can be handed its height at once
let fittedNode: HTMLTextAreaElement | null = null;
let fittedValue = "";
let fittedHeight = "";

/**
 * Whether the baker is at the foot of the chat.
 *
 * Only their own scrolling changes this -- a finger or a wheel on the chat a
 * moment before. The runtime puts the scroller back where it was after each
 * redraw, and that fires a scroll event too; taken as the baker's choice it
 * switched following off every time an answer arrived.
 */
let stick = true;
let touchedAt = 0;

function pin(): void {
  if (!stick) return;
  const scroller = scrollerOf(box());
  if (scroller && gapToBottom(scroller) > 1) scroller.scrollTop = scroller.scrollHeight;
}

/** now, and again after the runtime has had its say about the scroll position */
function pinSoon(): void {
  pin();
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(pin);
  });
}

function fit(): void {
  const field = box();
  if (!field) {
    fittedNode = null;
    return;
  }
  const fresh = field !== fittedNode;
  fittedNode = field;
  const value = field.value;

  if (fresh && fittedHeight && value === fittedValue) {
    // the same text on a new node: the height it had, before any layout
    field.style.height = fittedHeight;
    return;
  }
  if (!fresh && value === fittedValue) return;

  if (value === "") {
    // nothing in it: back to one line, which is its default. A box just
    // emptied was just sent, and the answer is what they want to see next.
    if (fittedValue) stick = true;
    field.style.height = "";
    fittedValue = "";
    fittedHeight = "";
    pinSoon();
    return;
  }

  // Grown, not collapsed. Starting from the height it has, the box asks
  // whether its content overflows and grows to fit; it only ever gets
  // shorter when the text got shorter, and then by measuring once.
  const shorter = value.length < fittedValue.length;
  if (fresh && fittedHeight) field.style.height = fittedHeight;
  if (shorter) field.style.height = "auto";
  const wanted = Math.min(field.scrollHeight, TALLEST);
  if (wanted > field.clientHeight || shorter) field.style.height = wanted + "px";
  if (field.scrollHeight > TALLEST) field.scrollTop = field.scrollHeight;

  fittedValue = value;
  fittedHeight = field.style.height;
  pinSoon();
}

function settle(): void {
  fit();
  pinSoon();
}

export function keepChatBoxFitted(): void {
  const touched = (event: Event) => {
    const target = event.target;
    const scroller = scrollerOf(box());
    if (scroller && target instanceof Node && scroller.contains(target)) touchedAt = Date.now();
  };
  document.addEventListener("touchstart", touched, { capture: true, passive: true });
  document.addEventListener("pointerdown", touched, { capture: true, passive: true });
  document.addEventListener("wheel", touched, { capture: true, passive: true });

  // the baker's own scrolling decides whether the chat follows the newest
  // message: scrolled up to read, it stays; back near the foot, it follows
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target !== scrollerOf(box())) return;
      if (Date.now() - touchedAt > TOUCH_WINDOW_MS) return;
      stick = gapToBottom(target) < NEAR_BOTTOM;
    },
    true,
  );
  // the keyboard coming up shrinks the view; the box should still be in it
  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLTextAreaElement && event.target.hasAttribute("data-bk-chatbox")) {
        stick = true;
        window.setTimeout(pinSoon, 50);
        window.setTimeout(pinSoon, 350);
      }
    },
    true,
  );
  document.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement && event.target.hasAttribute("data-bk-chatbox")) fit();
  });
  const observer = new MutationObserver(settle);
  observer.observe(document, { childList: true, subtree: true, characterData: true });
  // the value can also arrive from the microphone, which is neither a
  // keystroke nor always a change to the page's structure; and the runtime's
  // restore of the scroll position can land after everything above
  window.setInterval(settle, 300);
  settle();
}
