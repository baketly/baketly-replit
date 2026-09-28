// Going back the way an iPhone goes back.
//
// Every screen that pushes onto the stack has its own way of popping it —
// cancelIngredientEdit, backFromAnalyticsDetail, a dozen more — and each is
// bound to a control somewhere on that screen. There was no single way to say
// "go back", which is what a gesture needs.
//
// This adds one: a handler on the root controller that pops the stack
// whatever screen is showing, and a hidden button bound to it. The gesture
// itself lives in swipe-back.ts and does nothing more than press that button,
// so the navigation still runs through the app's own state rather than
// something reaching into it from outside.

const backHandler = `      bkBack: () => this.setState(st => {
        const stack = Array.isArray(st.stack) ? [...st.stack] : [];
        const previous = stack.pop();
        // nothing underneath: the baker is on a tab, where back means nothing
        if (!previous) return null;
        return { screen: previous, stack };
      }),
`;

/** The handler, on the same controller every screen is drawn from. */
function addBackHandler(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable controller anchor for back");
  return template.replace(
    anchor,
    (_match, indent: string) => `${backHandler}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/**
 * The button the gesture presses.
 *
 * Hidden, and out of the tab order: it is a way for the gesture to reach the
 * controller, not a control anyone should find. It sits just inside the
 * scrolling body, which every screen is drawn into.
 */
function addBackButton(template: string): string {
  const anchor = '<div style="flex:1;overflow:auto;min-height:0';
  const at = template.indexOf(anchor);
  if (at === -1) throw new Error("Missing scroll body anchor for back button");
  const opens = template.indexOf(">", at) + 1;
  const button =
    '<button id="bk-back" type="button" tabindex="-1" aria-hidden="true"' +
    ' sc-camel-on-click="{{ bkBack }}" style="display:none"></button>';
  return template.slice(0, opens) + button + template.slice(opens);
}

export function applySwipeBackBehavior(template: string): string {
  return addBackButton(addBackHandler(template));
}
