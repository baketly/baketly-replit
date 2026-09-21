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
  "gemini-3.6-flash",
  "gemini-flash-latest",
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

export type GeminiSource = { title: string; uri: string };
export type GeminiResult = {
  text: string;
  sources: GeminiSource[];
  searches: string[];
};

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GenerateOptions = {
  apiKey: string;
  parts: GeminiPart[];
  /** omit to get plain text back; JSON mode suppresses tool use, so grounded
   *  lookups must run schema-free and be structured in a second pass */
  responseSchema?: unknown;
  /** e.g. [{ google_search: {} }] to let the model look things up */
  tools?: unknown[];
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
): Promise<GeminiResult> {
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
          ...(options.tools ? { tools: options.tools } : {}),
          generationConfig: {
            temperature: options.temperature ?? 0,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
            ...(options.responseSchema
              ? {
                  responseMimeType: "application/json",
                  responseSchema: options.responseSchema,
                }
              : {}),
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
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> };
      groundingMetadata?: {
        webSearchQueries?: unknown;
        groundingChunks?: Array<{ web?: { uri?: unknown; title?: unknown } }>;
      };
    }>;
  };
  const candidate = payload.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim() ?? "";
  // Sources come from the API's own grounding metadata, never from the model's
  // prose, so a cited page is one it actually retrieved.
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => ({
      title: typeof chunk.web?.title === "string" ? chunk.web.title : "",
      uri: typeof chunk.web?.uri === "string" ? chunk.web.uri : "",
    }))
    .filter((source) => source.title || source.uri);
  const searches = Array.isArray(candidate?.groundingMetadata?.webSearchQueries)
    ? (candidate.groundingMetadata.webSearchQueries as unknown[]).filter(
        (q): q is string => typeof q === "string",
      )
    : [];
  return { text, sources, searches };
}

// ---------------------------------------------------------------------------
// Function calling
//
// The model is given a set of tools and asked a question. It answers either
// with words or with a request to run one of them; a request is run here, its
// result handed back, and the conversation continues until the model has what
// it needs. The tools do the work and own the numbers — the model decides
// which to call and what the answers mean.
// ---------------------------------------------------------------------------

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type ToolRunner = (call: ToolCall) => Promise<unknown>;

export interface ToolConversationOptions {
  apiKey: string;
  /** the tool declarations, in Gemini's function-declaration shape */
  toolDeclarations: unknown[];
  runTool: ToolRunner;
  /** system rules plus the question, as the first user turn */
  prompt: string;
  /** earlier turns of this conversation, oldest first */
  history?: Array<{ role: "user" | "model"; text: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  attemptTimeoutMs?: number;
  budgetMs?: number;
  /** how many rounds of tool calls to allow before insisting on an answer */
  maxRounds?: number;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (call: ToolCall, ms: number, error: string | null) => void;
  onModelSkipped?: (model: string, error: GeminiProviderError) => void;
}

export interface ToolConversationResult {
  text: string;
  model: string;
  calls: ToolCall[];
  rounds: number;
}

type Content = { role: "user" | "model"; parts: unknown[] };

async function requestWithTools(
  apiKey: string,
  model: string,
  contents: Content[],
  options: ToolConversationOptions,
  timeoutMs: number,
): Promise<{ text: string; calls: ToolCall[]; parts: unknown[] }> {
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
          contents,
          tools: [{ function_declarations: options.toolDeclarations }],
          generationConfig: {
            temperature: options.temperature ?? 0.3,
            maxOutputTokens: options.maxOutputTokens ?? 2048,
          },
        }),
      },
    );
  } catch (error) {
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
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: unknown;
          functionCall?: { name?: unknown; args?: unknown };
        }>;
      };
    }>;
  };
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  const calls: ToolCall[] = parts
    .filter((part) => part.functionCall && typeof part.functionCall.name === "string")
    .map((part) => ({
      name: part.functionCall?.name as string,
      args:
        part.functionCall?.args && typeof part.functionCall.args === "object"
          ? (part.functionCall.args as Record<string, unknown>)
          : {},
    }));

  return { text, calls, parts };
}

/**
 * Runs a conversation in which the model may call tools. Returns its final
 * words plus every tool it used, so the caller can say what an answer rests on.
 */
export async function converseWithTools(
  options: ToolConversationOptions,
): Promise<ToolConversationResult> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 20_000;
  const deadline = Date.now() + (options.budgetMs ?? 60_000);
  const maxRounds = options.maxRounds ?? 4;

  const contents: Content[] = [
    ...(options.history || []).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user" as const, parts: [{ text: options.prompt }] },
  ];

  let lastProviderError: GeminiProviderError | null = null;

  for (const model of GEMINI_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining <= 2_000) break;

    // Each model gets the conversation from the start, so a model that fails
    // mid-way never leaves the next one holding half a dialogue.
    const working: Content[] = contents.map((entry) => ({ ...entry }));
    const used: ToolCall[] = [];

    try {
      for (let round = 0; round < maxRounds; round++) {
        const left = deadline - Date.now();
        if (left <= 1_000) break;
        const turn = await requestWithTools(
          options.apiKey,
          model,
          working,
          options,
          Math.min(attemptTimeoutMs, left),
        );

        if (turn.calls.length === 0) {
          return { text: turn.text, model, calls: used, rounds: round + 1 };
        }

        working.push({ role: "model", parts: turn.parts });
        const responses: unknown[] = [];
        for (const call of turn.calls) {
          options.onToolCall?.(call);
          const startedAt = Date.now();
          let result: unknown;
          let failure: string | null = null;
          try {
            result = await options.runTool(call);
          } catch (error) {
            failure = error instanceof Error ? error.message : "tool failed";
            // A failed tool is information, not the end of the answer: the
            // model is told, and can try another way or say what is missing.
            result = { error: failure };
          }
          options.onToolResult?.(call, Date.now() - startedAt, failure);
          used.push(call);
          responses.push({
            functionResponse: { name: call.name, response: { result } },
          });
        }
        working.push({ role: "user", parts: responses });
      }

      // Out of rounds: ask for words, with everything it has gathered.
      const left = deadline - Date.now();
      if (left > 1_000) {
        working.push({
          role: "user",
          parts: [{ text: "Answer now, in plain words, using only what the tools returned." }],
        });
        const final = await requestWithTools(
          options.apiKey,
          model,
          working,
          options,
          Math.min(attemptTimeoutMs, left),
        );
        return { text: final.text, model, calls: used, rounds: maxRounds };
      }
    } catch (error) {
      if (error instanceof GeminiProviderError && isRetryableProviderError(error)) {
        lastProviderError = error;
        options.onModelSkipped?.(model, error);
        continue;
      }
      throw error;
    }
  }

  throw lastProviderError ?? new GeminiProviderError(502, null, "No Gemini model was reachable");
}

/** Walks the model list until one answers. Returns raw JSON text. */
export async function generateJson(
  options: GenerateOptions,
): Promise<GeminiResult & { model: string }> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 12_000;
  const deadline = Date.now() + (options.budgetMs ?? 28_000);
  let lastProviderError: GeminiProviderError | null = null;

  for (const model of GEMINI_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) break;
    try {
      const result = await requestOnce(
        options.apiKey,
        model,
        options,
        Math.min(attemptTimeoutMs, remaining),
      );
      return { ...result, model };
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
