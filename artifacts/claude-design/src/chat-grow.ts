// The chat's box, as tall as what is in it.
//
// A box one line tall hides a long question while it is being asked. Dictating
// is the worst of it: the words arrive faster than they can be read, scroll
// out of sight to the left, and the baker sends something they never saw. So
// the box grows with its content, to about five lines, and scrolls after that.
//
// Height is not something the markup can say -- it depends on the text -- and
// the page redraws the box on every keystroke, handing back a fresh element at
// its default height. So it is measured and set here, after every change to
// the page, from the document itself: the generated runtime draws the app by
// replacing the whole <html> element, and an observer on a node inside it dies
// with the node.

/** past this the box scrolls instead of growing; the same figure as the CSS */
const TALLEST = 124;

function box(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>("textarea[data-bk-chatbox]");
}

function fit(): void {
  const field = box();
  if (!field) return;
  // measured from nothing, or the box could only ever grow
  const previous = field.style.height;
  field.style.height = "auto";
  const wanted = Math.min(field.scrollHeight, TALLEST);
  const height = wanted > 0 ? wanted + "px" : previous;
  field.style.height = height;
  // the newest line is the one being written
  if (field.scrollHeight > TALLEST) field.scrollTop = field.scrollHeight;
}

export function keepChatBoxFitted(): void {
  const observer = new MutationObserver(fit);
  observer.observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement && event.target.hasAttribute("data-bk-chatbox")) fit();
  });
  // the value can also arrive from the microphone, which is neither a
  // keystroke nor always a change to the page's structure
  window.setInterval(fit, 300);
  fit();
}
