// Reading a price off a page.
//
// A price on a bakery site is written a dozen ways: $18, 18.00 USD, €18,50,
// "From $18", "Was $22 now $18", "18". The rules here are conservative on
// purpose. A number that cannot be read confidently returns null, and null
// keeps a product out of the market rather than putting a wrong number in it.

/** Currency symbols worth recognising, and what they mean. */
const SYMBOLS: Array<[RegExp, string]> = [
  [/[$]|\bUSD\b/i, "USD"],
  [/€|\bEUR\b/i, "EUR"],
  [/£|\bGBP\b/i, "GBP"],
  [/₪|\bILS\b|\bNIS\b/i, "ILS"],
  [/\bCAD\b|\bC\$/i, "CAD"],
  [/\bAUD\b|\bA\$/i, "AUD"],
];

export interface ParsedPrice {
  price: number;
  currency: string | null;
  /** "from £18" is a starting price, not the price of one thing */
  isFrom: boolean;
  /** a sale price was shown beside a higher one */
  isSale: boolean;
}

export function currencyFrom(text: string): string | null {
  for (const [pattern, code] of SYMBOLS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/** 1.234,56 in European writing is 1234.56. */
function toNumber(raw: string): number | null {
  let text = raw.replace(/\s/g, "");
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // whichever comes last is the decimal separator
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "18,50" is a price; "1,250" is a thousand separator
    text = /,\d{2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * A price from a scrap of text. Returns null when there is no number, when the
 * number is not plausibly a bakery price, or when the text offers several
 * prices with no way to tell which belongs to the product.
 */
export function parsePrice(text: string, fallbackCurrency?: string | null): ParsedPrice | null {
  if (!text) return null;
  const cleaned = text.replace(/ /g, " ").trim();
  if (!cleaned) return null;

  const isFrom = /\b(from|starting at|starts at|from only|as low as)\b/i.test(cleaned);
  const isSale = /\b(sale|was|now|rrp|reduced|off)\b/i.test(cleaned);

  const numbers = [...cleaned.matchAll(/\d+(?:[.,]\d+)*(?:[.,]\d{1,2})?/g)]
    .map((match) => toNumber(match[0]))
    .filter((value): value is number => value !== null && value > 0 && value < 100_000);
  if (numbers.length === 0) return null;

  // "Was $22 now $18": the lower of a was/now pair is what is charged today.
  const price = isSale ? Math.min(...numbers) : numbers[0];
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    price: Math.round(price * 100) / 100,
    currency: currencyFrom(cleaned) || fallbackCurrency || null,
    isFrom,
    isSale,
  };
}
