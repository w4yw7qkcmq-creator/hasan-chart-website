import { randomBytes } from "node:crypto";
import {
  detectImageMimeFromMagicBytes,
  extractImageDimensions,
  extensionForMimeType,
} from "./payment-proof-storage.js";
import { validateAllowedImageMimeType } from "./upload-validation.js";

import { CONTENT_IMAGE_BUCKET } from "./content-image-url.js";

export { buildContentImagePublicUrl } from "./content-image-url.js";
export const CONTENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const CONTENT_IMAGE_MIN_DIMENSION = 10;
export const CONTENT_IMAGE_SIGNED_UPLOAD_TTL_SECONDS = 300;

const PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;
const NONCE_PATTERN = /^[a-zA-Z0-9_-]{24,64}$/;

export function generateContentImageNonce() {
  return randomBytes(24).toString("base64url");
}

export function buildContentImageObjectPath({ contentType, postId, nonce, mimeType }) {
  const normalizedType = String(contentType || "").trim();
  const normalizedPostId = String(postId || "").trim();
  const normalizedNonce = String(nonce || "").trim();
  const ext = extensionForMimeType(mimeType);

  if (!["academy", "result"].includes(normalizedType)) {
    throw Object.assign(new Error("نوع المحتوى غير صالح"), { status: 400, code: "INVALID_CONTENT_TYPE" });
  }
  if (!PATH_SEGMENT_PATTERN.test(normalizedPostId)) {
    throw Object.assign(new Error("معرف المنشور غير صالح"), { status: 400, code: "INVALID_POST_ID" });
  }
  if (!NONCE_PATTERN.test(normalizedNonce)) {
    throw Object.assign(new Error("رمز الرفع غير صالح"), { status: 400, code: "INVALID_NONCE" });
  }
  if (!ext) {
    throw Object.assign(new Error("نوع الملف غير مدعوم"), { status: 400, code: "INVALID_UPLOAD_MIME" });
  }

  return `${normalizedType}/${normalizedPostId}/${normalizedNonce}.${ext}`;
}

export function parseContentImageObjectPath(objectPath) {
  const normalized = String(objectPath || "").trim();
  const match = normalized.match(/^(academy|result)\/([^/]+)\/([a-zA-Z0-9_-]{24,64})\.(jpg|png|webp)$/);
  if (!match) return null;

  return {
    contentType: match[1],
    postId: match[2],
    nonce: match[3],
    extension: match[4],
  };
}

export function isValidContentImageObjectPath(objectPath, expectedContentType = null) {
  const parsed = parseContentImageObjectPath(objectPath);
  if (!parsed) return false;
  if (expectedContentType && parsed.contentType !== expectedContentType) return false;
  return true;
}

export function assertContentImagePathOwnedByPost(objectPath, { contentType, postId }) {
  const parsed = parseContentImageObjectPath(objectPath);
  if (!parsed) {
    throw Object.assign(new Error("مسار الصورة غير صالح"), { status: 400, code: "INVALID_OBJECT_PATH" });
  }
  if (parsed.contentType !== String(contentType || "").trim()) {
    throw Object.assign(new Error("مسار الصورة لا يطابق نوع المحتوى"), {
      status: 400,
      code: "PATH_TYPE_MISMATCH",
    });
  }
  if (parsed.postId !== String(postId || "").trim()) {
    throw Object.assign(new Error("مسار الصورة لا يخص هذا المنشور"), {
      status: 403,
      code: "PATH_POST_MISMATCH",
    });
  }
  return parsed;
}

export async function createContentImageSignedUploadUrl(supabase, objectPath) {
  const { data, error } = await supabase.storage
    .from(CONTENT_IMAGE_BUCKET)
    .createSignedUploadUrl(objectPath, CONTENT_IMAGE_SIGNED_UPLOAD_TTL_SECONDS);

  if (error) {
    throw Object.assign(new Error("تعذر إعداد رفع الصورة"), {
      status: 503,
      code: "SIGNED_UPLOAD_URL_FAILED",
      cause: error,
    });
  }

  return {
    signedUrl: data?.signedUrl || data?.signedURL || null,
    token: data?.token || null,
    path: objectPath,
    expiresIn: CONTENT_IMAGE_SIGNED_UPLOAD_TTL_SECONDS,
  };
}

export async function downloadContentImageObject(supabase, objectPath) {
  const { data, error } = await supabase.storage.from(CONTENT_IMAGE_BUCKET).download(objectPath);
  if (error) {
    const message = String(error?.message || "").toLowerCase();
    const notFound =
      error?.statusCode === 404 ||
      error?.status === 404 ||
      message.includes("not found") ||
      message.includes("object not found");
    throw Object.assign(new Error("ملف الصورة غير موجود"), {
      status: notFound ? 404 : 502,
      code: notFound ? "OBJECT_NOT_FOUND" : "OBJECT_DOWNLOAD_FAILED",
      cause: error,
    });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length > CONTENT_IMAGE_MAX_BYTES) {
    throw Object.assign(new Error("حجم الصورة أكبر من المسموح"), {
      status: 413,
      code: "UPLOAD_TOO_LARGE",
    });
  }

  return buffer;
}

export async function validateContentImageUploadBuffer(buffer, { declaredMime = null } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) {
    return { ok: false, code: "EMPTY_UPLOAD" };
  }
  if (bytes.length > CONTENT_IMAGE_MAX_BYTES) {
    return { ok: false, code: "UPLOAD_TOO_LARGE" };
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
    return { ok: false, code: "INVALID_IMAGE_DIMENSIONS" };
  }
  if (
    dimensions.width < CONTENT_IMAGE_MIN_DIMENSION ||
    dimensions.height < CONTENT_IMAGE_MIN_DIMENSION
  ) {
    return {
      ok: false,
      code: "INVALID_PLACEHOLDER_IMAGE",
      reason: "image-dimensions-too-small",
    };
  }

  return {
    ok: true,
    mime: detectedMime,
    bytes: bytes.length,
    extension: extensionForMimeType(detectedMime),
    width: dimensions.width,
    height: dimensions.height,
  };
}

export async function validateUploadedContentImageObject(supabase, objectPath, { declaredMime = null } = {}) {
  const buffer = await downloadContentImageObject(supabase, objectPath);
  return validateContentImageUploadBuffer(buffer, { declaredMime });
}
