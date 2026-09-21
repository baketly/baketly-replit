// Which pages of a bakery's site are worth reading.
//
// A shop does not put its prices on the homepage; it puts them behind a link
// called Shop, Menu, Order or Products. Rather than crawling a site — slow,
// rude, and mostly pictures — this reads the homepage once, takes the links
// whose text or path says "this is where the things for sale are", and adds
// the handful of conventional paths that ecommerce platforms always use.

/** Path fragments that ecommerce and ordering platforms use by convention. */
const CONVENTIONAL_PATHS = [
  "/shop",
  "/menu",
  "/products",
  "/collections/all",
  "/order",
  "/store",
  "/cakes",
  "/bakery",
];

/** Link text or href that says a page lists things for sale. */
const WANTED = [
  "shop",
  "menu",
  "product",
  "order",
  "store",
  "collection",
  "catalog",
  "catalogue",
  "buy",
  "price",
  "cake",
  "bread",
  "cookie",
  "pastry",
  "dessert",
];

/** Pages that are never a price list, whatever they are called. */
const UNWANTED = [
  "cart",
  "checkout",
  "account",
  "login",
  "signin",
  "register",
  "privacy",
  "terms",
  "policy",
  "contact",
  "about",
  "blog",
  "news",
  "careers",
  "job",
  "gallery",
  "instagram",
  "facebook",
  "faq",
  "delivery-information",
  "gift-card",
  "wholesale-enquiry",
];

function scoreCandidate(href: string, text: string): number {
  const haystack = (href + " " + text).toLowerCase();
  if (UNWANTED.some((word) => haystack.includes(word))) return -1;
  let score = 0;
  for (const word of WANTED) {
    if (haystack.includes(word)) score += 1;
  }
  // a path called /shop beats a sentence that mentions shopping
  if (/\/(shop|menu|products|collections|order|store)(\/|$|\?)/.test(href.toLowerCase())) score += 3;
  return score;
}

/** Absolute, same-site, fragment- and query-free where possible. */
function normalizeHref(href: string, base: URL): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return null;
    url.hash = "";
    // keep pagination, drop tracking
    for (const key of [...url.searchParams.keys()]) {
      if (!/^(page|p)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Candidate product pages for a site, best first, including the homepage: on a
 * small bakery site the prices are often right there.
 */
export function productPageCandidates(
  homepageUrl: string,
  homepageHtml: string,
  limit = 6,
): string[] {
  let base: URL;
  try {
    base = new URL(homepageUrl);
  } catch {
    return [];
  }

  const scored = new Map<string, number>();
  scored.set(base.toString(), 1);

  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(homepageHtml)) !== null) {
    const href = normalizeHref(match[1], base);
    if (!href) continue;
    const text = match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const score = scoreCandidate(href, text);
    if (score <= 0) continue;
    scored.set(href, Math.max(scored.get(href) ?? 0, score));
  }

  for (const path of CONVENTIONAL_PATHS) {
    const href = normalizeHref(path, base);
    if (href && !scored.has(href)) scored.set(href, 2);
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([href]) => href)
    .slice(0, limit);
}
