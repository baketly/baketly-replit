---
name: Bundled template replacements
description: Safe string replacement rule for the generated-page transformation layer.
---

When injecting generated template code through `String.prototype.replace`, use a replacement callback (`() => replacement`) rather than passing a replacement string directly whenever that code contains dollar signs.

**Why:** JavaScript interprets dollar-prefixed sequences in replacement strings (including `$'`), which can silently splice the unmatched suffix into generated code and create difficult-to-diagnose runtime syntax errors.

**How to apply:** Use callbacks for code or markup replacements that could contain currency literals, template syntax, or other dollar-prefixed content. Validate the resulting generated script with a syntax check before browser testing.

When a replacement pattern spans a conditional section, confirm whether it also consumes closing tags owned by an enclosing section and restore them deliberately.

**Why:** A structurally unbalanced generated template can render the beginning of the app but silently omit every later screen and shared UI element, such as the bottom tab bar.

**How to apply:** After markup transforms, check that scoped conditional tags balance before browser testing, especially for patterns that match through a following parent close.

For optional overlays in imported templates, locate the enclosing conditional block by its state binding and replace the balanced block rather than matching its inner rows or controller text exactly.

**Why:** Generated markup can gain attributes or formatting changes that make row-level exact matches silently no-op, leaving stale bindings or an unbalanced UI path.

**How to apply:** Scan matching conditional tags from the state-bound opening tag to its paired close, validate the result remains balanced, and use a localized fallback that removes only known unresolved bindings if replacement cannot proceed.

When multiple generated controllers share an insertion point, match the anchor's indentation with spaces/tabs only, not arbitrary whitespace.

**Why:** A preceding controller can introduce a blank line; an exact newline anchor then silently skips the next controller, leaving its UI bindings unresolved at runtime.

**How to apply:** Use a whitespace-tolerant, indentation-preserving anchor and assert the generated output contains each controller's state and event-handler markers before browser testing.