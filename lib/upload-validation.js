export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const DANGEROUS_UPLOAD_EXTENSIONS = new Set([
  "js",
  "jsx",
  "mjs",
  "cjs",
  "html",
  "htm",
  "svg",
  "exe",
  "php",
  "sh",
  "bat",
  "cmd",
  "msi",
  "jar",
  "zip",
  "rar",
  "7z",
  "dll",
  "vbs",
  "ps1",
]);

export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PAYMENT_PROOF_DATA_URL_BYTES = 6 * 1024 * 1024;
export const MAX_MONEY_AMOUNT = 1_000_000;

export function sanitizeUploadFileName(value, maxLength = 255) {
  const base = String(value || "")
    .replace(/[/\\]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);

  return base || null;
}

export function getUploadFileExtension(fileName) {
  const match = String(fileName || "")
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);

  return match?.[1] || "";
}

export function isDangerousUploadFileName(fileName) {
  const extension = getUploadFileExtension(fileName);
  return extension ? DANGEROUS_UPLOAD_EXTENSIONS.has(extension) : false;
}

export function validateAllowedImageMimeType(mimeType) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  return ALLOWED_UPLOAD_MIME_TYPES.has(normalized);
}

export function validateDataUrlImage(
  dataUrl,
  { maxBytes = MAX_PAYMENT_PROOF_DATA_URL_BYTES, required = true } = {}
) {
  const raw = String(dataUrl || "").trim();

  if (!raw) {
    return required
      ? { ok: false, code: "EMPTY_UPLOAD" }
      : { ok: true, skipped: true };
  }

  if (/[<>`]/.test(raw) || /^javascript:/i.test(raw)) {
    return { ok: false, code: "INVALID_UPLOAD_FORMAT" };
  }

  const match = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);

  if (!match) {
    return { ok: false, code: "INVALID_UPLOAD_FORMAT" };
  }

  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");

  if (!validateAllowedImageMimeType(mime)) {
    return { ok: false, code: "INVALID_UPLOAD_MIME" };
  }

  const base64 = match[2].replace(/\s/g, "");
  const approxBytes = Math.ceil((base64.length * 3) / 4);

  if (approxBytes > maxBytes) {
    return { ok: false, code: "UPLOAD_TOO_LARGE" };
  }

  return { ok: true, mime, approxBytes };
}

export function validateScreenshotMetadata({
  fileName = null,
  mimeType = null,
  size = 0,
} = {}) {
  const normalizedName = sanitizeUploadFileName(fileName);
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const normalizedSize = Number(size || 0);

  if (!normalizedName && !normalizedMime && !normalizedSize) {
    return { ok: true, skipped: true };
  }

  if (normalizedName && isDangerousUploadFileName(normalizedName)) {
    return { ok: false, code: "DANGEROUS_UPLOAD_FILE" };
  }

  if (normalizedMime && !validateAllowedImageMimeType(normalizedMime)) {
    return { ok: false, code: "INVALID_UPLOAD_MIME" };
  }

  if (!Number.isFinite(normalizedSize) || normalizedSize < 0) {
    return { ok: false, code: "INVALID_UPLOAD_SIZE" };
  }

  if (normalizedSize > MAX_IMAGE_UPLOAD_BYTES) {
    return { ok: false, code: "UPLOAD_TOO_LARGE" };
  }

  return { ok: true };
}
