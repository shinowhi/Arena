// Client-side upload prep: shrink photos BEFORE they hit the 4.5MB Vercel
// body cap (which returns non-JSON HTML and used to surface as a raw
// SyntaxError). Used by exam analyze + life forge + market photo assist.
"use client";

export const UPLOAD_MAX_SIDE = 1600;
// Headroom under Vercel's 4.5MB request cap (base64 + multipart overhead).
export const UPLOAD_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);

export const UNREADABLE_PHOTO =
  "This photo format can't be read on this device — try a JPG or PNG instead.";

export const UPLOAD_TOO_LARGE =
  "This photo is too large even after shrinking — try a smaller photo.";

export type PreparedImage = {
  file: File;
  originalBytes: number;
  preparedBytes: number;
  resized: boolean;
};

function decodeViaBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
}

function decodeViaElement(file: File): Promise<{ bitmap: ImageBitmap; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      createImageBitmap(img)
        .then((bitmap) => resolve({ bitmap, url }))
        .catch(reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}

function drawFitted(bitmap: ImageBitmap, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Downscale longest side to <=1600px and JPEG-encode under 3.5MB.
// Already-small JPEG/PNG/WebP uploads pass through byte-identical.
// HEIC and other exotic types are attempted via canvas; when the browser
// cannot decode them we throw a friendly Error (never a raw DOMException).
export async function prepareUploadImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap | null = null;
  let objectUrl = "";
  try {
    try {
      bitmap = await decodeViaBitmap(file);
    } catch {
      const fallback = await decodeViaElement(file).catch(() => null);
      if (!fallback) throw new Error(UNREADABLE_PHOTO);
      bitmap = fallback.bitmap;
      objectUrl = fallback.url;
    }
    const longest = Math.max(bitmap.width, bitmap.height);
    const smallEnough =
      longest <= UPLOAD_MAX_SIDE &&
      file.size <= UPLOAD_MAX_BYTES &&
      (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp");
    if (smallEnough) {
      return { file, originalBytes: file.size, preparedBytes: file.size, resized: false };
    }
    // Quality loop first (keeps resolution for handwriting), then shrink
    // the canvas in steps as a backstop. Always terminates.
    let side = UPLOAD_MAX_SIDE;
    let quality = 0.92;
    let blob = await canvasToJpeg(drawFitted(bitmap, side), quality);
    while (blob.size > UPLOAD_MAX_BYTES && quality > 0.5) {
      quality = Math.max(0.5, quality - 0.12);
      blob = await canvasToJpeg(drawFitted(bitmap, side), quality);
    }
    for (const smaller of [1280, 1024, 800]) {
      if (blob.size <= UPLOAD_MAX_BYTES) break;
      side = smaller;
      blob = await canvasToJpeg(drawFitted(bitmap, side), 0.7);
    }
    // Absolute backstop: never emit a file the API cannot accept.
    if (blob.size > UPLOAD_MAX_BYTES) throw new Error(UPLOAD_TOO_LARGE);
    const name = file.name.replace(/\.[a-z0-9]+$/i, "") || "photo";
    const out = new File([blob], `${name}.jpg`, { type: "image/jpeg" });
    return { file: out, originalBytes: file.size, preparedBytes: out.size, resized: true };
  } catch (e) {
    if (e instanceof Error && (e.message === UNREADABLE_PHOTO || e.message === UPLOAD_TOO_LARGE)) throw e;
    // Any canvas failure (tainted, OOM, missing context) degrades to the
    // original file when it fits the cap, else a friendly error.
    if (file.size <= UPLOAD_MAX_BYTES && file.type.startsWith("image/")) {
      return { file, originalBytes: file.size, preparedBytes: file.size, resized: false };
    }
    throw new Error(UNREADABLE_PHOTO);
  } finally {
    try {
      bitmap?.close();
    } catch {
      // Ignore close errors; GC reclaims the bitmap.
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// Map an HTTP failure to a friendly English string. Never throws and never
// returns raw SyntaxError/HTML text: non-JSON bodies (Vercel 413 pages,
// gateway errors) fall back to status-based copy.
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const byStatus = statusMessage(res.status);
  try {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return byStatus ?? fallback;
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const serverMsg =
      typeof data?.error === "string" && data.error.trim().length > 0 ? data.error.trim() : null;
    // 400/422 bodies from our API are already friendly English; pass through.
    if (res.status === 400 || res.status === 422) return serverMsg ?? byStatus ?? fallback;
    return byStatus ?? serverMsg ?? fallback;
  } catch {
    return byStatus ?? fallback;
  }
}

function statusMessage(status: number): string | null {
  if (status === 413) {
    return "That photo is too large — try a smaller crop or a lower-resolution shot.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The AI service is busy — wait a few seconds and retry.";
  }
  if (status >= 500) return "Something went wrong on our side — please retry.";
  return null;
}

// Parse a 2xx JSON body defensively: HTML/gateway pages become `fallback`
// instead of a raw "Unexpected token '<'" SyntaxError.
export async function readApiJson<T>(res: Response, fallback: string): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error(fallback);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(fallback);
  }
}
