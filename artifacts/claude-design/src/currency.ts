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
  { code: "ILS", label: "ILS ₪", symbol: "₪" },
  { code: "CAD", label: "CAD CA$", symbol: "CA$" },
  { code: "AUD", label: "AUD A$", symbol: "A$" },
  { code: "NZD", label: "NZD NZ$", symbol: "NZ$" },
  { code: "CHF", label: "CHF CHF", symbol: "CHF" },
  { code: "SEK", label: "SEK kr", symbol: "kr" },
  { code: "NOK", label: "NOK kr", symbol: "kr" },
  { code: "DKK", label: "DKK kr", symbol: "kr" },
  { code: "PLN", label: "PLN zł", symbol: "zł" },
  { code: "CZK", label: "CZK Kč", symbol: "Kč" },
  { code: "HUF", label: "HUF Ft", symbol: "Ft" },
  { code: "RON", label: "RON lei", symbol: "lei" },
  { code: "JPY", label: "JPY ¥", symbol: "¥" },
  { code: "INR", label: "INR ₹", symbol: "₹" },
  { code: "MXN", label: "MXN MX$", symbol: "MX$" },
  { code: "BRL", label: "BRL R$", symbol: "R$" },
  { code: "ZAR", label: "ZAR R", symbol: "R" },
  { code: "AED", label: "AED AED", symbol: "AED" },
  { code: "SGD", label: "SGD S$", symbol: "S$" },
  { code: "HKD", label: "HKD HK$", symbol: "HK$" },
  { code: "TRY", label: "TRY ₺", symbol: "₺" },
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
      currencyCode: this.state.currency || 'USD',
      setCurrency: e => this.setState({ currency: e.target.value }),
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
      '<select class="input" value="{{ currencyCode }}" sc-camel-on-change="{{ setCurrency }}"' +
      ' aria-label="Currency" style="width:100%">' +
      '<option value="USD">USD $</option><option value="EUR">EUR €</option><option value="GBP">GBP £</option><option value="ILS">ILS ₪</option><option value="CAD">CAD CA$</option><option value="AUD">AUD A$</option><option value="NZD">NZD NZ$</option><option value="CHF">CHF CHF</option><option value="SEK">SEK kr</option><option value="NOK">NOK kr</option><option value="DKK">DKK kr</option><option value="PLN">PLN zł</option><option value="CZK">CZK Kč</option><option value="HUF">HUF Ft</option><option value="RON">RON lei</option><option value="JPY">JPY ¥</option><option value="INR">INR ₹</option><option value="MXN">MXN MX$</option><option value="BRL">BRL R$</option><option value="ZAR">ZAR R</option><option value="AED">AED AED</option><option value="SGD">SGD S$</option><option value="HKD">HKD HK$</option><option value="TRY">TRY ₺</option>' +
      "</select>",
  );
}

/**
 * The page formats money through three helpers of its own, all declared inside
 * renderVals(). Everything they produce — the Markets estimate, recipe prices,
 * pantry unit costs, and every figure on the till — was dollars regardless of
 * the setting.
 */
function bindPageHelpers(template: string): string {
  // What the page declares, what it should say instead, a name for the error,
  // and how many times it appears. The count is part of the anchor: a helper
  // that quietly stops matching is how the till kept printing dollars through
  // two rounds of currency work.
  const helpers: Array<[string, string, string, number]> = [
    [
      "const $r = n => '$' + Math.round(n).toLocaleString();",
      `const $r = n => ${currencySymbolExpr} + Math.round(n).toLocaleString();`,
      "rounded",
      1,
    ],
    [
      "const fmt = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));",
      `const fmt = n => ${currencySymbolExpr} + (Number.isInteger(n) ? n : n.toFixed(2));`,
      "exact",
      1,
    ],
    // The till's own formatter, declared beside $r in the same block. It was
    // missed when the other two were bound, so the one screen a customer
    // watches over the baker's shoulder — the basket, the charge button, the
    // change owed — stayed in dollars while the rest of the app changed.
    [
      "const $ = n => '$' + n.toFixed(2);",
      `const $ = n => ${currencySymbolExpr} + n.toFixed(2);`,
      "till",
      1,
    ],
    // The notes a customer hands over. Only the label is anchored on: the
    // condition beside it is rewritten by the sale patch before this runs.
    [
      "opts.push({ label: '$' + v, v });",
      `opts.push({ label: ${currencySymbolExpr} + v, v });`,
      "tender",
      1,
    ],
    // What the done screen shows before a sale has landed in it.
    [
      "doneTotal: posDone ? $(posDone.total) : '$0.00',",
      `doneTotal: posDone ? $(posDone.total) : ${currencySymbolExpr} + '0.00',`,
      "done total",
      1,
    ],
    // A product's price, as it reads beside its name: the market lineup, the
    // same lineup on a new event, and the till's cash rows. These sit in the
    // same statements as costs the helpers above already fixed, so leaving
    // them made a single row say "cost £1.24" and "$3.25" side by side.
    [
      "priceStr: '$' + p.price,",
      `priceStr: ${currencySymbolExpr} + p.price,`,
      "lineup price",
      3,
    ],
    [
      "priceStr: '$' + r.sell,",
      `priceStr: ${currencySymbolExpr} + r.sell,`,
      "till price",
      1,
    ],
  ];
  let out = template;
  for (const [from, to, label, count] of helpers) {
    const found = out.split(from).length - 1;
    if (found !== count) {
      throw new Error(`Page money helper ${label}: expected ${count}, found ${found}`);
    }
    out = out.split(from).join(to);
  }
  return out;
}

export function applyCurrencyBehavior(template: string): string {
  return bindPageHelpers(bindCurrencyControl(addCurrencyController(template)));
}
