// The currency the baker sells in.
//
// The mockup's Settings had three radio buttons that were pure decoration:
// USD carried a hardcoded `checked`, so every re-render snapped the choice
// back to it, and nothing read the value anyway — every amount in the app was
// a hardcoded "$".
//
// The symbol is resolved from state wherever money is formatted, so adding a
// currency means adding one line to SYMBOLS below and one option to the
// control.

export const CURRENCIES = [
  { code: "USD", label: "USD $", symbol: "$" },
  { code: "EUR", label: "EUR €", symbol: "€" },
  { code: "GBP", label: "GBP £", symbol: "£" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const symbolMap = `({ ${CURRENCIES.map((c) => `${c.code}: '${c.symbol}'`).join(", ")} })`;

/**
 * A JS expression that yields the baker's currency symbol. Evaluated inside a
 * controller, where `this` is the page component.
 */
export const currencySymbolExpr = `(${symbolMap}[this.state.currency] || '$')`;

/** Declares `CUR` at the top of a controller so money formatting can use it. */
export const currencyConst = `        const CUR = ${currencySymbolExpr};\n`;

const controller = `      currencySymbol: ${currencySymbolExpr},
      currencyOptions: ${JSON.stringify(CURRENCIES)}.map(option => ({
        label: option.label,
        bg: (this.state.currency || 'USD') === option.code ? 'var(--color-accent)' : 'transparent',
        fg: (this.state.currency || 'USD') === option.code ? '#fff' : '#8a8578',
        pick: () => this.setState({ currency: option.code })
      })),
`;

function addCurrencyController(template: string): string {
  const anchor = /([ \t]*)onAnalytics:\s*screen\s*===\s*'analytics',/;
  if (!anchor.test(template)) throw new Error("Missing stable currency anchor");
  return template.replace(
    anchor,
    (_match, indent: string) => `${controller}${indent}onAnalytics: screen === 'analytics',`,
  );
}

/**
 * Replaces the radio group. The stylesheet selected an option with
 * `.seg-opt:has(input:checked)`, which cannot survive a re-render that rebuilds
 * the inputs from a template, so the selected state is painted from state
 * instead.
 */
function bindCurrencyControl(template: string): string {
  const anchor =
    '<div class="seg"><label class="seg-opt"><input type="radio" name="cur" checked="">USD $</label><label class="seg-opt"><input type="radio" name="cur">EUR €</label><label class="seg-opt"><input type="radio" name="cur">GBP £</label></div>';
  if (!template.includes(anchor)) throw new Error("Missing currency control anchor");
  return template.replace(
    anchor,
    () =>
      '<div class="seg">' +
      '<sc-for list="{{ currencyOptions }}" as="cur" hint-placeholder-count="3">' +
      '<span class="seg-opt" sc-camel-on-click="{{ cur.pick }}" style="background:{{ cur.bg }};color:{{ cur.fg }}">{{ cur.label }}</span>' +
      "</sc-for></div>",
  );
}

/**
 * The page formats money through two helpers of its own, both declared inside
 * renderVals(). Everything they produce — the Markets estimate, recipe prices,
 * pantry unit costs — was dollars regardless of the setting.
 */
function bindPageHelpers(template: string): string {
  const helpers: Array<[string, string, string]> = [
    [
      "const $r = n => '$' + Math.round(n).toLocaleString();",
      `const $r = n => ${currencySymbolExpr} + Math.round(n).toLocaleString();`,
      "rounded",
    ],
    [
      "const fmt = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));",
      `const fmt = n => ${currencySymbolExpr} + (Number.isInteger(n) ? n : n.toFixed(2));`,
      "exact",
    ],
  ];
  let out = template;
  for (const [from, to, label] of helpers) {
    if (!out.includes(from)) throw new Error(`Missing page money helper: ${label}`);
    out = out.replace(from, () => to);
  }
  return out;
}

export function applyCurrencyBehavior(template: string): string {
  return bindPageHelpers(bindCurrencyControl(addCurrencyController(template)));
}
