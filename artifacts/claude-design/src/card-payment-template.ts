// Taking a card is not something Baketly can do yet.
//
// The till offers two ways to be paid: "Card · tap to pay" and "Cash". Only
// one of them is real. Tapping a phone against a customer's card needs Apple's
// Tap to Pay entitlement, a payment provider behind it, and a merchant account
// — none of which exist yet — so the button led a baker into a flow that
// cannot end in money arriving.
//
// The segment stays where it is rather than being cut out: it is a promise
// about what this screen will do, and a till with one lonely Cash button says
// less about the product than a till with a card option marked coming soon.
// What changes is that it no longer responds, no longer looks like something
// to press, and no longer decides how a sale is recorded.

/** The label, and the handler that made it a button. */
function retireTheCardButton(template: string): string {
  const anchor =
    '<button sc-camel-on-click="{{ setPosCard }}" style="flex:1;border:0;cursor:pointer;' +
    "font-family:var(--font-body);font-size:12px;font-weight:600;padding:9px 0;" +
    'border-radius:10px;background:{{ segCardBg }};color:{{ segCardColor }}">Card · tap to pay</button>';
  if (template.split(anchor).length - 1 !== 1) {
    throw new Error("Missing card payment button anchor");
  }

  const retired =
    '<button type="button" disabled aria-disabled="true" ' +
    'aria-label="Card payments are coming soon" ' +
    'style="flex:1;border:0;cursor:default;font-family:var(--font-body);font-size:12px;' +
    "font-weight:600;padding:9px 0;border-radius:10px;background:transparent;" +
    'color:var(--color-neutral-600);opacity:0.75">Card · coming soon</button>';

  return template.split(anchor).join(retired);
}

/**
 * Cash becomes what the till opens on.
 *
 * The method was card unless it was cash — an absent choice meant card — so
 * with the card button retired the screen would have opened on a method a
 * baker can no longer choose, showing the card panel and no way back to it.
 */
function cashByDefault(template: string): string {
  const anchor = "posOnCard: posMethod !== 'cash', posOnCash: posMethod === 'cash',";
  if (template.split(anchor).length - 1 !== 1) {
    throw new Error("Missing payment method anchor");
  }
  return template
    .split(anchor)
    .join("posOnCard: posMethod === 'card', posOnCash: posMethod !== 'card',");
}

/** And the segment's colours, which followed the same "not cash" rule. */
function cashLooksChosen(template: string): string {
  const anchor =
    "segCashBg: posMethod === 'cash' ? 'var(--color-accent)' : 'transparent',";
  if (template.split(anchor).length - 1 !== 1) {
    throw new Error("Missing cash segment anchor");
  }
  return template
    .split(anchor)
    .join("segCashBg: posMethod !== 'card' ? 'var(--color-accent)' : 'transparent',");
}

function cashSegmentInk(template: string): string {
  const anchor = "segCashColor: posMethod === 'cash' ? '#fff' : '#8a8578',";
  if (template.split(anchor).length - 1 !== 1) {
    throw new Error("Missing cash segment colour anchor");
  }
  return template
    .split(anchor)
    .join("segCashColor: posMethod !== 'card' ? '#fff' : '#8a8578',");
}

export function applyCardPaymentBehavior(template: string): string {
  return cashSegmentInk(cashLooksChosen(cashByDefault(retireTheCardButton(template))));
}
