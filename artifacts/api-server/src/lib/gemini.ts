// Shared Gemini plumbing. Both the label scanner and Ask Baketly go through
// here so there is one ordered model list and one retry policy to maintain.
//
// A key that can reach one Flash model cannot be assumed to reach them all, so
// provider-level failures fall through to the next candidate. A response that
// parses but is not useful is a real answer, not a provider fault, and must not
// consume the rest of the chain.

export const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
] as const;

export class MissingGeminiKeyError extends Error {}

export class GeminiProviderError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode: unknown,
    message: string,
  ) {
    super(message);
  }
}

export function isRetryableProviderError(error: GeminiProviderError): boolean {
  return (
    error.status === 403 ||
    error.status === 404 ||
    error.status === 429 ||
    error.status >= 500
  );
}

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GenerateOptions = {
  apiKey: string;
  parts: GeminiPart[];
  responseSchema: unknown;
  temperature?: number;
  maxOutputTokens?: number;
  attemptTimeoutMs?: number;
  budgetMs?: number;
  onModelSkipped?: (model: string, error: GeminiProviderError) => void;
};

async function requestOnce(
  apiKey: string,
  model: string,
  options: GenerateOptions,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: options.parts }],
          generationConfig: {
            temperature: options.temperature ?? 0,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
            responseMimeType: "application/json",
            responseSchema: options.responseSchema,
          },
        }),
      },
    );
  } catch (error) {
    // Network failure or per-attempt timeout: surface as a provider error so
    // the caller can move on while it still has budget.
    throw new GeminiProviderError(
      504,
      "fetch_failed",
      error instanceof Error ? error.message : "Gemini request failed",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: unknown; message?: unknown } }
      | null;
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message.slice(0, 500)
        : `Gemini request failed with status ${response.status}`;
    throw new GeminiProviderError(response.status, payload?.error?.code, message);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim() ?? ""
  );
}

/** Walks the model list until one answers. Returns raw JSON text. */
export async function generateJson(
  options: GenerateOptions,
): Promise<{ text: string; model: string }> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 12_000;
  const deadline = Date.now() + (options.budgetMs ?? 28_000);
  let lastProviderError: GeminiProviderError | null = null;

  for (const model of GEMINI_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) break;
    try {
      const text = await requestOnce(
        options.apiKey,
        model,
        options,
        Math.min(attemptTimeoutMs, remaining),
      );
      return { text, model };
    } catch (error) {
      if (
        error instanceof GeminiProviderError &&
        isRetryableProviderError(error)
      ) {
        lastProviderError = error;
        options.onModelSkipped?.(model, error);
        continue;
      }
      throw error;
    }
  }

  throw (
    lastProviderError ??
    new GeminiProviderError(502, null, "No Gemini model was reachable")
  );
}
