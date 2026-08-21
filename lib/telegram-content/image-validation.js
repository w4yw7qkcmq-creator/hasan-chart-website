import {
  detectImageMimeFromMagicBytes,
  extensionForMimeType,
  extractImageDimensions,
} from "../payment-proof-storage.js";
import { validateAllowedImageMimeType } from "../upload-validation.js";
import {
  TELEGRAM_CONTENT_MAX_BYTES,
  TELEGRAM_CONTENT_MIN_DIMENSION,
} from "./constants.js";

export function validateTelegramImageBuffer(buffer, { declaredMime = null } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) {
    return { ok: false, code: "EMPTY_UPLOAD" };
  }
  if (bytes.length > TELEGRAM_CONTENT_MAX_BYTES) {
    return { ok: false, code: "OVERSIZE_IMAGE" };
  }

  const detectedMime = detectImageMimeFromMagicBytes(bytes);
  if (!detectedMime || !validateAllowedImageMimeType(detectedMime)) {
    return { ok: false, code: "INVALID_UPLOAD_MIME" };
  }

  if (declaredMime && declaredMime !== detectedMime) {
    return { ok: false, code: "MIME_MISMATCH" };
  }

  const dimensions = extractImageDimensions(bytes, detectedMime);
  if (!dimensions?.width || !dimensions?.height) {
    return { ok: false, code: "CORRUPT_IMAGE" };
  }

  if (
    dimensions.width < TELEGRAM_CONTENT_MIN_DIMENSION ||
    dimensions.height < TELEGRAM_CONTENT_MIN_DIMENSION
  ) {
    return { ok: false, code: "INVALID_IMAGE_DIMENSIONS" };
  }

  return {
    ok: true,
    mime: detectedMime,
    extension: extensionForMimeType(detectedMime),
    width: dimensions.width,
    height: dimensions.height,
    bytes: bytes.length,
  };
}
