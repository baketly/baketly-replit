// Target planning, worked out here rather than by the model.
//
// Asked to reach a revenue target the model either declined to try, or produced
// quantities whose stated total was wrong — a five line plan came back summing
// to $1,501 when its own lines added to $1,556. A plan a baker acts on has to
// add up, so the arithmetic is done here and the model only puts it into words.

export type PlanProduct = {
  name: string;
  price: number;
  marginPct?: number;
  profitPerUnit?: number;
  ingredientCount?: number;
};

export type PlanLine = {
  name: string;
  addUnits: number;
  totalUnits: number;
  price: number;
  lineRevenue: number;
};

export type TargetPlan = {
  target: number;
  alreadyPlanned: number;
  gap: number;
  lines: PlanLine[];
  addedRevenue: number;
  total: number;
  overshoot: number;
  reason: string;
};

/** Pulls a money target out of a question: "hit $1,500", "reach 1500". */
export function findTarget(question: string): number | null {
  const match = question.match(/(?:\$|£|€|₪)\s*([\d][\d,.]*)|\b([\d][\d,]{2,})\b/);
  if (!match) return null;
  const raw = (match[1] ?? match[2] ?? "").replace(/,/g, "");
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const PLANNING_WORDS =
  /\b(hit|reach|get to|make|earn|bring in|aim for|target|how do i|what should i bake|how many)\b/i;

export function looksLikePlanning(question: string): boolean {
  return PLANNING_WORDS.test(question);
}

/**
 * Fills the gap to the target with whole units, favouring products that keep
 * the most per unit and take the fewest ingredients. Greedy on purpose: a
 * baker wants a few sensible lines, not an optimal knapsack.
 */
export function buildTargetPlan(
  target: number,
  products: PlanProduct[],
  planned: Array<{ name: string; quantity: number; price: number }>,
): TargetPlan | null {
  const sellable = products.filter((product) => Number(product.price) > 0);
  if (sellable.length === 0) return null;

  const plannedByName = new Map<string, number>();
  let alreadyPlanned = 0;
  for (const item of planned) {
    const quantity = Math.max(0, Math.round(Number(item.quantity) || 0));
    if (quantity <= 0) continue;
    plannedByName.set(item.name, quantity);
    alreadyPlanned += quantity * (Number(item.price) || 0);
  }
  alreadyPlanned = Math.round(alreadyPlanned * 100) / 100;

  const gap = Math.round((target - alreadyPlanned) * 100) / 100;
  if (gap <= 0) {
    return {
      target,
      alreadyPlanned,
      gap: 0,
      lines: [],
      addedRevenue: 0,
      total: alreadyPlanned,
      overshoot: Math.round((alreadyPlanned - target) * 100) / 100,
      reason: "already at or above the target",
    };
  }

  // Keeps the most per unit first; ties broken by the simpler bake.
  const ranked = [...sellable].sort((a, b) => {
    const profitA = Number(a.profitPerUnit ?? a.price) || 0;
    const profitB = Number(b.profitPerUnit ?? b.price) || 0;
    if (profitB !== profitA) return profitB - profitA;
    return (a.ingredientCount ?? 99) - (b.ingredientCount ?? 99);
  });

  // At most three lines: a plan a baker can hold in their head.
  const chosen = ranked.slice(0, 3);
  const lines: PlanLine[] = [];
  let remaining = gap;

  chosen.forEach((product, index) => {
    if (remaining <= 0) return;
    const price = Number(product.price) || 0;
    const isLast = index === chosen.length - 1;
    // spread the gap across the chosen products, last one closes it
    const share = isLast ? remaining : remaining / (chosen.length - index);
    const units = isLast ? Math.ceil(share / price) : Math.round(share / price);
    if (units <= 0) return;
    const lineRevenue = Math.round(units * price * 100) / 100;
    lines.push({
      name: product.name,
      addUnits: units,
      totalUnits: (plannedByName.get(product.name) ?? 0) + units,
      price,
      lineRevenue,
    });
    remaining = Math.round((remaining - lineRevenue) * 100) / 100;
  });

  if (lines.length === 0) return null;

  const addedRevenue = Math.round(lines.reduce((sum, line) => sum + line.lineRevenue, 0) * 100) / 100;
  const total = Math.round((alreadyPlanned + addedRevenue) * 100) / 100;
  const best = chosen[0];
  return {
    target,
    alreadyPlanned,
    gap,
    lines,
    addedRevenue,
    total,
    overshoot: Math.round((total - target) * 100) / 100,
    reason:
      best.marginPct !== undefined
        ? `${best.name} keeps ${best.marginPct}% and takes ${best.ingredientCount ?? "few"} ingredients`
        : `${best.name} keeps the most per unit`,
  };
}

/** The plan as text for the prompt, so the model reports rather than computes. */
export function describePlan(plan: TargetPlan): string {
  const lines: string[] = [];
  lines.push(`Target: ${plan.target}`);
  lines.push(`Already planned: ${plan.alreadyPlanned}`);
  lines.push(`Gap to cover: ${plan.gap}`);
  for (const line of plan.lines) {
    lines.push(
      `Add ${line.addUnits} x ${line.name} at ${line.price} = ${line.lineRevenue} (${line.totalUnits} in total)`,
    );
  }
  lines.push(`Added: ${plan.addedRevenue}`);
  lines.push(`Planned total after this: ${plan.total}`);
  if (plan.overshoot > 0) lines.push(`This lands ${plan.overshoot} above the target`);
  lines.push(`Chosen because: ${plan.reason}`);
  return lines.join("\n");
}
