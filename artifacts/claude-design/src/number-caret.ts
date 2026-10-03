// Tapping a price puts the caret after the price.
//
// A number box opens with a figure already in it, and a tap anywhere on that
// figure drops the caret where the finger landed -- in the middle of 17.50,
// as often as not. Backspace then eats a digit out of the middle, so the
// first tap is spent getting to the end and the second one starts the work.
//
// Every box that asks for a number is put right: the caret goes to the end on
// focus, which is where someone who means to replace a figure would put it,
// and backspace works from the first press.
//
// Done here rather than in the markup because the fields are drawn by the
// generated page, which this app patches as text and cannot give a focus
// handler of its own.

function isNumberBox(node: EventTarget | null): node is HTMLInputElement {
  if (!(node instanceof HTMLInputElement)) return false;
  const mode = node.getAttribute("inputmode");
  return mode === "decimal" || mode === "numeric";
}

function caretToEnd(field: HTMLInputElement): void {
  const end = field.value.length;
  try {
    field.setSelectionRange(end, end);
  } catch {
    // a field that does not carry a selection; nothing to place
  }
}

export function keepNumberCaretAtEnd(): void {
  document.addEventListener(
    "focusin",
    (event) => {
      const field = event.target;
      if (!isNumberBox(field)) return;
      caretToEnd(field);
      // iOS places its own caret after the focus event, so again once the
      // browser has had its turn
      window.setTimeout(() => {
        if (document.activeElement === field) caretToEnd(field);
      }, 0);
    },
    true,
  );
}
