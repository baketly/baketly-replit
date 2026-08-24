const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type PhotoUploadResponse = {
  objectPath?: unknown;
};

export function getPhotoUrl(photoPath: unknown): string {
  if (
    typeof photoPath !== "string" ||
    !/^\/objects\/uploads\/[a-z0-9-]+$/i.test(photoPath)
  ) {
    return "";
  }

  return `/api/storage${photoPath}`;
}

export async function uploadPhoto(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const request = await fetch("/api/storage/uploads", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const response = (await request.json().catch(() => ({}))) as PhotoUploadResponse & {
    error?: unknown;
  };
  if (!request.ok) {
    throw new Error(
      typeof response.error === "string"
        ? response.error
        : "Could not upload the photo. Please try again.",
    );
  }
  if (!getPhotoUrl(response.objectPath)) {
    throw new Error("The uploaded photo reference was invalid.");
  }

  return response.objectPath as string;
}