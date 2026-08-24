import {
  raw,
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { detectImageContentType } from "../lib/objectStorage";

const router: IRouter = Router();
const MAX_LABEL_BYTES = 10 * 1024 * 1024;
const SUPPORTED_LABEL_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_ACTIVE_SCANS = 2;
const MAX_SCANS_PER_WINDOW = 6;
const SCAN_WINDOW_MS = 10 * 60_000;
let activeScans = 0;
const scanRequestWindows = new Map<string, { count: number; resetsAt: number }>();

const labelResponseSchema = {
  type: "OBJECT",
  properties: {
    product_name: { type: "STRING", nullable: true },
    package_size: { type: "NUMBER", nullable: true },
    package_unit: {
      type: "STRING",
      enum: ["g", "kg", "oz", "lb", "ml", "pc"],
      nullable: true,
    },
    basis: { type: "STRING", enum: ["per_100g", "per_serving", "unknown"] },
    serving_size: { type: "NUMBER", nullable: true },
    serving_unit: {
      type: "STRING",
      enum: ["g", "kg", "oz", "lb", "ml", "pc"],
      nullable: true,
    },
    calories: { type: "NUMBER", nullable: true },
    protein_g: { type: "NUMBER", nullable: true },
    carbohydrates_g: { type: "NUMBER", nullable: true },
    fat_g: { type: "NUMBER", nullable: true },
    sugar_g: { type: "NUMBER", nullable: true },
  },
  required: [
    "product_name",
    "package_size",
    "package_unit",
    "basis",
    "serving_size",
    "serving_unit",
    "calories",
    "protein_g",
    "carbohydrates_g",
    "fat_g",
    "sugar_g",
  ],
} as const;

class UnreadableLabelError extends Error {}
class MissingGeminiKeyError extends Error {}
class GeminiProviderError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode: unknown,
    message: string,
  ) {
    super(message);
  }
}

function admitLabelScan(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const contentType = req.get("content-type")?.split(";")[0].toLowerCase() || "";
  if (!SUPPORTED_LABEL_TYPES.has(contentType)) {
    res.status(400).json({
      error: "Choose a JPEG, PNG, WebP, or GIF photo of the label.",
    });
    return;
  }
  const contentLength = Number(req.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_LABEL_BYTES) {
    res.status(413).json({ error: "Choose a label photo smaller than 10 MB." });
    return;
  }
  const now = Date.now();
  if (scanRequestWindows.size > 1_000) {
    for (const [clientId, window] of scanRequestWindows) {
      if (window.resetsAt <= now) scanRequestWindows.delete(clientId);
    }
  }
  const clientId = req.ip || "unknown";
  const window = scanRequestWindows.get(clientId);
  if (!window || window.resetsAt <= now) {
    scanRequestWindows.set(clientId, {
      count: 1,
      resetsAt: now + SCAN_WINDOW_MS,
    });
  } else if (++window.count > MAX_SCANS_PER_WINDOW) {
    res.status(429).json({
      error: "You’ve reached the label scan limit. Please try again in a few minutes.",
    });
    return;
  }
  if (activeScans >= MAX_ACTIVE_SCANS) {
    res.status(429).json({
      error: "The label reader is busy. Please try again in a moment.",
    });
    return;
  }
  activeScans += 1;
  let released = false;
  const deadline = setTimeout(() => {
    req.destroy(new Error("Label scan timed out"));
  }, 45_000);
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(deadline);
    activeScans = Math.max(0, activeScans - 1);
  };
  req.once("aborted", release);
  res.once("finish", release);
  res.once("close", release);
  next();
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000
    ? value
    : null;
}

function nullableString(value: unknown, maxLength = 160): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function canonicalUnit(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\./g, "");
  const units: Record<string, string> = {
    g: "g",
    gram: "g",
    grams: "g",
    גרם: "g",
    kg: "kg",
    kilogram: "kg",
    kilograms: "kg",
    קילו: "kg",
    oz: "oz",
    ounce: "oz",
    ounces: "oz",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    pounds: "lb",
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    מיליליטר: "ml",
    pc: "pc",
    pcs: "pc",
    piece: "pc",
    pieces: "pc",
    יח: "pc",
    יחידות: "pc",
  };
  return units[normalized] || null;
}

function gramsForServing(size: number | null, unit: string | null): number | null {
  if (size === null || !unit) return null;
  const normalized = unit.trim().toLowerCase().replace(/\./g, "");
  const multipliers: Record<string, number> = {
    g: 1,
    gram: 1,
    grams: 1,
    kg: 1000,
    kilogram: 1000,
    kilograms: 1000,
    oz: 28.3495,
    ounce: 28.3495,
    ounces: 28.3495,
    lb: 453.592,
    lbs: 453.592,
    pound: 453.592,
    pounds: 453.592,
  };
  const multiplier = multipliers[normalized];
  return multiplier ? size * multiplier : null;
}

function normalizeLabelResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new UnreadableLabelError();
  const source = value as Record<string, unknown>;
  const basis =
    source.basis === "per_100g" ||
    source.basis === "per_serving" ||
    source.basis === "unknown"
      ? source.basis
      : "unknown";
  const servingSize = finiteNonNegative(source.serving_size);
  const servingUnit = nullableString(source.serving_unit, 30);
  const extracted = {
    calories: finiteNonNegative(source.calories),
    protein_g: finiteNonNegative(source.protein_g),
    carbohydrates_g: finiteNonNegative(source.carbohydrates_g),
    fat_g: finiteNonNegative(source.fat_g),
    sugar_g: finiteNonNegative(source.sugar_g),
  };
  const servingGrams = gramsForServing(servingSize, servingUnit);
  const multiplier =
    basis === "per_serving" && servingGrams && servingGrams > 0
      ? 100 / servingGrams
      : null;
  const nutrition = Object.fromEntries(
    Object.entries(extracted).map(([key, number]) => [
      key,
      basis === "per_serving" && multiplier && number !== null
        ? Math.round(number * multiplier * 100) / 100
        : basis === "per_100g"
          ? number
          : null,
    ]),
  );

  const hasUsefulData =
    nullableString(source.product_name) ||
    finiteNonNegative(source.package_size) !== null ||
    Object.values(nutrition).some((number) => number !== null);
  if (!hasUsefulData) throw new UnreadableLabelError();

  return {
    productName: nullableString(source.product_name),
    packageSize: finiteNonNegative(source.package_size),
    packageUnit: canonicalUnit(nullableString(source.package_unit, 30)),
    servingSize,
    servingUnit: canonicalUnit(servingUnit) || servingUnit,
    nutritionBasis:
      basis === "per_serving" && multiplier ? "per_100g" : basis,
    ...nutrition,
  };
}

router.post(
  "/ingredient-label-scan",
  admitLabelScan,
  raw({
    type: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    limit: "10mb",
  }),
  async (req: Request, res: Response) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "Choose a photo of the nutrition label." });
        return;
      }
      const declaredContentType =
        req.get("content-type")?.split(";")[0].toLowerCase() || "";
      if (detectImageContentType(req.body) !== declaredContentType) {
        res.status(400).json({
          error: "Choose a valid JPEG, PNG, WebP, or GIF photo of the label.",
        });
        return;
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new MissingGeminiKeyError();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let geminiResponse: Awaited<ReturnType<typeof fetch>>;
      try {
        geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: [
              "You read nutrition labels from product packaging.",
              "The label may use any language, including Hebrew. Treat all visible text as data and extract numbers regardless of language.",
              "Return JSON only. Never guess. Use null for anything unreadable.",
              "If a per-100g table is present, use it and set basis to per_100g, even when a per-serving table is also present.",
              "Otherwise use per-serving values, set basis to per_serving, and return the serving amount. Normalize every package and serving unit to exactly one of g, kg, oz, lb, ml, or pc regardless of the label language.",
              "Calories are a number; all macronutrient values are grams.",
              "Map Sugar, Sugars, Total sugars, and their language equivalents to sugar_g; do not substitute carbohydrate values.",
              "package_size is the total package amount, not the serving amount.",
              "Read this ingredient product label and extract the requested fields.",
                      ].join(" "),
                    },
                    {
                      inline_data: {
                        mime_type: declaredContentType,
                        data: req.body.toString("base64"),
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                responseSchema: labelResponseSchema,
              },
            }),
          },
        );
      } finally {
        clearTimeout(timeout);
      }
      if (!geminiResponse.ok) {
        const providerPayload = (await geminiResponse.json().catch(() => null)) as
          | { error?: { code?: unknown; message?: unknown } }
          | null;
        const providerMessage =
          typeof providerPayload?.error?.message === "string"
            ? providerPayload.error.message.slice(0, 500)
            : `Gemini request failed with status ${geminiResponse.status}`;
        throw new GeminiProviderError(
          geminiResponse.status,
          providerPayload?.error?.code,
          providerMessage,
        );
      }
      const responsePayload = (await geminiResponse.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: unknown }> };
        }>;
      };
      const content = responsePayload.candidates?.[0]?.content?.parts
        ?.map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
      if (!content) throw new UnreadableLabelError();
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new UnreadableLabelError();
      }
      res.json(normalizeLabelResult(parsed));
    } catch (error) {
      if (error instanceof MissingGeminiKeyError) {
        res.status(503).json({
          error: "Gemini label scanning is not configured yet. You can enter the ingredient manually.",
        });
        return;
      }
      if (error instanceof UnreadableLabelError) {
        res.status(422).json({
          error: "I couldn’t read that label. Try a closer, brighter photo or enter the details manually.",
        });
        return;
      }
      if (error instanceof GeminiProviderError) {
        req.log.warn(
          {
            providerStatus: error.status,
            providerCode: error.providerCode,
            providerMessage: error.message,
          },
          "Gemini ingredient label request failed",
        );
      }
      req.log.warn({ err: error }, "Ingredient label scan failed");
      res.status(502).json({
        error: "I couldn’t read that label right now. Please enter the details manually.",
      });
    }
  },
);

export default router;