// Dropdowns that have something in them on a phone.
//
// The app's pickers — the month in Analytics, the reminder times in Settings,
// the recipe in the calculator — built their options with the template's own
// loop element inside the <select>. In Chrome that works. In Safari it does
// not, and the difference is the HTML parser rather than anything to do with
// the app: a <select> may contain only <option> and <optgroup>, and WebKit
// drops anything else while Chrome keeps it. The loop was dropped, its options
// went with it, and every one of those pickers opened empty on the phone while
// looking perfect in the preview.
//
// So the options no longer travel as markup. Each select carries its list as
// JSON on a data attribute — which is just text, and survives any parser — and
// this builds the <option> elements from it.

/** What each select was last built from, so nothing is rebuilt needlessly. */
const built = new WeakMap<HTMLSelectElement, string>();

interface Choice {
  value: string;
  label: string;
}

function readChoices(raw: string): Choice[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Choice => !!entry && typeof entry === "object")
      .map((entry) => ({
        value: String((entry as Choice).value ?? ""),
        label: String((entry as Choice).label ?? ""),
      }));
  } catch {
    // a half-written attribute during a render: leave what is there
    return [];
  }
}

function fill(select: HTMLSelectElement): void {
  const raw = select.getAttribute("data-bk-options");
  if (raw === null) return;
  // the same list as last time, and the options still there: nothing to do
  if (built.get(select) === raw && select.options.length > 0) return;

  const choices = readChoices(raw);
  if (!choices.length && !raw.startsWith("[]")) return;

  // The value the app wants selected. Read before the options are replaced,
  // because replacing them clears it.
  const wanted = select.getAttribute("value") ?? select.value;

  select.replaceChildren(
    ...choices.map((choice) => {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      return option;
    }),
  );

  if (wanted && choices.some((choice) => choice.value === wanted)) {
    select.value = wanted;
  }
  built.set(select, raw);
}

function fillAll(root: ParentNode): void {
  const selects = root.querySelectorAll?.("select[data-bk-options]");
  selects?.forEach((select) => fill(select as HTMLSelectElement));
}

/**
 * Keeps every such select filled, for as long as the app is open.
 *
 * The app re-renders by rewriting attributes, so the watch is on attribute
 * changes as well as on new markup: a month picker whose list grows when a
 * sale is recorded has to notice.
 */
export function keepSelectsFilled(): void {
  const refill = () => fillAll(document);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      // a whole document arriving at once: look through all of it
      if (record.target === document) {
        refill();
        continue;
      }
      if (record.type === "attributes" && record.target instanceof HTMLSelectElement) {
        fill(record.target);
        continue;
      }
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLSelectElement) fill(node);
        else if (node instanceof Element) fillAll(node);
      });
    }
  });

  const start = () => {
    refill();
    // the document, not its element: the unpacker finishes by replacing the
    // whole documentElement, and an observer watching that is left holding a
    // node no longer in the page — which is exactly why the first version of
    // this never fired
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-bk-options", "value"],
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
