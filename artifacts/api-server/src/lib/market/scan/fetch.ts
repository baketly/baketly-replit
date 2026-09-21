// Reading someone else's website, politely and defensively.
//
// Every fetch here is bounded: a timeout, a size cap, a redirect cap, and only
// HTML or JSON accepted. A bakery site can be a 40 MB image-led homepage or a
// login wall, and neither should be able to hold up a price check or fill
// memory. Failures are values, not exceptions: one unreachable shop must never
// end the check for the other fourteen.

const USER_AGENT = "Baketly/1.0 (home bakery pricing; +https://baketly.app)";
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;

export interface FetchedPage {
  url: string;
  /** the URL after redirects, which is what a source link should point at */
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  ok: boolean;
  error: string | null;
}

function failure(url: string, error: string, status = 0): FetchedPage {
  return { url, finalUrl: url, status, contentType: "", body: "", ok: false, error };
}

/** One page, capped. Never throws. */
export async function fetchPage(url: string, timeoutMs = TIMEOUT_MS): Promise<FetchedPage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return failure(url, "invalid url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return failure(url, "unsupported protocol");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
        "Accept-Language": "en,*;q=0.5",
      },
    });
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok) {
      return {
        url,
        finalUrl: response.url || url,
        status: response.status,
        contentType,
        body: "",
        ok: false,
        error: "status " + response.status,
      };
    }
    // A PDF menu or a video is not something to parse for prices.
    if (
      contentType &&
      !contentType.includes("html") &&
      !contentType.includes("json") &&
      !contentType.includes("text/plain")
    ) {
      return {
        url,
        finalUrl: response.url || url,
        status: response.status,
        contentType,
        body: "",
        ok: false,
        error: "unsupported content type " + contentType.split(";")[0],
      };
    }

    // read to the cap rather than trusting content-length
    const reader = response.body?.getReader();
    if (!reader) {
      return failure(url, "empty response", response.status);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    await reader.cancel().catch(() => {});
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
      .toString("utf8")
      .slice(0, MAX_BYTES);

    return {
      url,
      finalUrl: response.url || url,
      status: response.status,
      contentType,
      body,
      ok: true,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "timed out"
        : error instanceof Error
          ? error.message
          : "request failed";
    return failure(url, message);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch several pages with a small amount of concurrency, in order. */
export async function fetchPages(
  urls: string[],
  concurrency = 3,
  timeoutMs = TIMEOUT_MS,
): Promise<FetchedPage[]> {
  const results: FetchedPage[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (index < urls.length) {
      const at = index++;
      results[at] = await fetchPage(urls[at], timeoutMs);
    }
  });
  await Promise.all(workers);
  return results;
}
