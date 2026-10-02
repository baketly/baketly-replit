// The way a new chat bubble arrives.
//
// A message that appears from nothing is a page refreshing; one that rises
// into place is somebody answering. The difference is a quarter of a second
// of movement on the bubble that is new -- and only on that one. The chat
// screen redraws every bubble on every change of state, including each
// keystroke in the box, so animating "the last bubble" would make the last
// answer jump on every letter typed, and animating "a bubble that just got
// drawn" would make the whole history jump on every redraw.
//
// So each bubble carries a name (its data-bk-bubble), the names seen so far
// are remembered, and a bubble whose name is new is the one that moves. The
// history a screen opens with is marked seen without moving: it is not
// arriving, it was already there.

declare global {
  interface Window {
    __baketlyChatPopReset: () => void;
  }
}

/** how long the movement lasts; the same figure as the CSS */
const POP_MS = 240;

/** when each bubble arrived, by name, and the node that last carried it */
const arrived = new Map<string, { at: number; node: HTMLElement }>();
let primed = false;

function bubbles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-bk-bubble]"));
}

/**
 * Start, or carry on, the movement on a node.
 *
 * The screen redraws a frame after a message lands -- the pending flag
 * flips -- and the new node for the same bubble arrived with no class on it,
 * so the movement showed for one frame and vanished. A replacement node
 * picks the animation up where the last one left it, with a negative delay,
 * rather than starting again or not moving at all.
 */
function pop(node: HTMLElement, startedAt: number): void {
  const elapsed = Date.now() - startedAt;
  if (elapsed >= POP_MS) return;
  node.style.animationDelay = elapsed > 0 ? "-" + elapsed + "ms" : "";
  node.classList.add("bk-pop");
  node.addEventListener(
    "animationend",
    () => {
      node.classList.remove("bk-pop");
      node.style.animationDelay = "";
    },
    { once: true },
  );
}

/** set while the bubbles are gone, in case they are gone for good */
let emptySince = 0;
const GONE_MS = 400;

function settle(): void {
  const found = bubbles();
  if (found.length === 0) {
    // The chat screen may have gone -- or the page may be mid-redraw, with
    // the list emptied for a frame before it is filled again. The first time
    // this treated both the same: forgot everything, then met the redrawn
    // bubbles as history, and nothing ever moved. Only an absence that lasts
    // means the screen has closed.
    if (!emptySince) {
      emptySince = Date.now();
      window.setTimeout(() => {
        if (emptySince && bubbles().length === 0) {
          primed = false;
          arrived.clear();
        }
        emptySince = 0;
      }, GONE_MS);
    }
    return;
  }
  emptySince = 0;
  const now = Date.now();
  if (!primed) {
    // what a screen opens with was already there: marked as long arrived
    for (const bubble of found) {
      arrived.set(bubble.getAttribute("data-bk-bubble") || "", { at: now - POP_MS, node: bubble });
    }
    primed = true;
    return;
  }
  let newest: HTMLElement | null = null;
  for (const bubble of found) {
    const key = bubble.getAttribute("data-bk-bubble") || "";
    const known = arrived.get(key);
    if (!known) {
      arrived.set(key, { at: now, node: bubble });
      pop(bubble, now);
      newest = bubble;
    } else if (known.node !== bubble) {
      // the same bubble on a fresh node: carry the movement over
      known.node = bubble;
      pop(bubble, known.at);
    }
  }
  // and bring what arrived into view, the way a chat does
  if (newest) {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    newest.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }
}

export function keepChatBubblesPopping(): void {
  // From the document itself, not the <html> element: the generated runtime
  // draws the app by replacing the whole <html> element, and an observer on
  // the element being replaced dies with it. The Document node is never
  // replaced, and swapping <html> under it is a change it is told about.
  const observer = new MutationObserver(settle);
  observer.observe(document, { childList: true, subtree: true });
  settle();
  window.__baketlyChatPopReset = () => {
    primed = false;
    arrived.clear();
  };
}
