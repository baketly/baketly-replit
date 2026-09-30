// Plain English, last.
//
// The generated design writes like a product brief: revenue is compared with
// estimated production cost, prices are snapshots, margins are supported and
// figures are computed. A baker reading it on a Saturday morning has to
// translate every one of those before they mean anything.
//
// So this pass says the same things the way a person would say them out loud.
// The rules are about words only — nothing here moves an element or changes a
// number.
//
// It runs outermost, after every other pass, so it sees the final text: a
// sentence one of them replaced is rewritten in the form that actually
// reaches the screen, not the one the base template started with.

/** What it says now, and what it should say. */
type Rewrite = readonly [from: string, to: string];

const REWRITES: readonly Rewrite[] = [
  // --- money a baker gets to keep ---------------------------------------
  //
  // "Kept" reads like what is left over after someone else has taken theirs.
  // "Earned" is what the baker did.
  [">You kept<", ">You earned<"],
  [">Kept<", ">Earned<"],
  ["kept $", "earned $"],
  ["You keep $", "You earn $"],
  ["more kept per event", "more earned per event"],

  // --- the analytics labels, which read like a ledger ---------------------
  [
    "after production &amp; event fees ›",
    "after what you baked and what the stall cost ›",
  ],
  ["labor not costed", "your time is not counted yet"],
  ["% vs prev", "% vs last month"],
  ["labor not set", "hourly rate not set"],

  // A market's four figures. "Est." saved four characters and cost a reader
  // a moment's translation every time; the other two beside them already say
  // "expected", so all four now agree.
  ["Est. revenue", "Expected revenue"],
  ["Est. cost", "Expected cost"],
  ["Units planned", "Units to bake"],

  // --- sentences that needed saying differently -------------------------
  [
    "Actual profit compares revenue with the plan's estimated production cost — booth fee, travel and labor not included.",
    "Actual profit compares what you took with what the baking cost. The booth fee, getting there and your time are not counted.",
  ],
  [
    "Enter quantities sold. Skip anything already recorded order-by-order in the Cash Tracker — otherwise it counts twice.",
    "Enter how many you sold. Leave out anything you already rang up at the till, or it gets counted twice.",
  ],
  [
    "Prices and costs are a snapshot from when each product was added · booth fee not included.",
    "Prices and costs are from the day you added each product · the booth fee is not counted",
  ],
  [
    "Generated from the lineup — full batches, combined across recipes.",
    "Worked out from your lineup — full batches, added up across your recipes.",
  ],
  [
    "Calculated automatically · pick it in any recipe's packaging list",
    "Worked out for you · choose it in any recipe's packaging list",
  ],
  [
    "Calculated automatically · used in 11 recipes",
    "Worked out for you · used in 11 recipes",
  ],
  [
    "Right now your margins only count ingredients and packaging. Adding your time shows what each bake truly pays you per hour.",
    "Your margins count ingredients and packaging only. Add your hourly rate to see what each bake really pays you for your time.",
  ],
  [
    "That's a strong ingredient margin — but your time isn't counted yet. Add an hourly rate and Baketly will show your true profit on every bake.",
    "That is a healthy margin on ingredients, but your time is not counted yet. Add an hourly rate to see what you really earn on every bake.",
  ],
  [
    "None of your recipes include your time yet. Add an hourly rate to see true profit.",
    "None of your recipes count your time yet. Add an hourly rate to see what you really earn.",
  ],
  [
    "Add each product you'll take — prices and costs are copied in from your recipes.",
    "Add each product you will take. Prices and costs come from your recipes.",
  ],
  [
    "Saving creates the plan and its shopping list · booth fee not included in margin.",
    "Saving makes the plan and its shopping list · the booth fee is not in the margin",
  ],
  [
    "Point the camera at the barcode — Baketly pulls the price, size and nutrition label.",
    "Point the camera at the barcode. Baketly reads the price, the size and the label.",
  ],
  [
    "Pulled from the scanned label via Open Food Facts · flows into every recipe's macros",
    "Read from the label you scanned · used in every recipe that includes it",
  ],
  [
    "Computed from scanned ingredient labels · all 5 ingredients have nutrition data",
    "Added up from the labels you scanned · all 5 ingredients have nutrition on them",
  ],
  [
    "Product photo — pulled from the scan, or tap to add one from your phone.",
    "The photo from the label, or tap to add one from your phone.",
  ],
  [
    "Arrange your dashboard — move, hide or show sections.",
    "Arrange your home screen — move sections around, or hide the ones you do not use.",
  ],
  [
    "Priced per unit, added to each product's cost.",
    "Costed one at a time, then added to what each product costs.",
  ],
  [
    "Baketly checks if it's worth the table before you book.",
    "Baketly works out whether the table is worth it before you book.",
  ],
];

/**
 * Rewrites what is there, and does not mind what is not.
 *
 * A sentence missing from the template is the ordinary case, not a fault:
 * another pass may have replaced the screen it lived on, and a rewrite of a
 * sentence nobody will read should never stop the app from starting. What
 * would be a fault is none of them matching at all — that means the template
 * underneath changed wholesale, and every rule here is stale.
 */
export function applyWordingBehavior(template: string): string {
  let out = template;
  let landed = 0;
  for (const [from, to] of REWRITES) {
    if (!out.includes(from)) continue;
    out = out.split(from).join(to);
    landed += 1;
  }
  if (landed === 0) throw new Error("No wording rewrites matched the template");
  return out;
}
