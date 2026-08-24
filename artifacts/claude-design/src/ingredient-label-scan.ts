const MAX_LABEL_BYTES = 10 * 1024 * 1024;
const ACCEPTED_LABEL_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type IngredientLabelScan = {
  productName: string | null;
  packageSize: number | null;
  packageUnit: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  nutritionBasis: "per_100g" | "per_serving" | "unknown";
  calories: number | null;
  protein_g: number | null;
  carbohydrates_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
};

export async function scanIngredientLabel(
  file: File,
): Promise<IngredientLabelScan> {
  if (!ACCEPTED_LABEL_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP, or GIF photo of the label.");
  }
  if (file.size < 1 || file.size > MAX_LABEL_BYTES) {
    throw new Error("Choose a label photo smaller than 10 MB.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch("/api/ingredient-label-scan", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    } & Partial<IngredientLabelScan>;
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "I couldn’t read that label. Please enter the details manually.",
      );
    }
    return payload as IngredientLabelScan;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "The label took too long to read. Try a clearer photo or enter the details manually.",
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        "I couldn’t reach the label reader. Please enter the details manually.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}