import { randomBytes } from "node:crypto";
import { validateAllowedImageMimeType } from "./upload-validation.js";

export const PAYMENT_PROOF_BUCKET = "payment-proofs";
export const PAYMENT_PROOF_MAX_BYTES = 8 * 1024 * 1024;
export const PAYMENT_PROOF_SIGNED_READ_TTL_SECONDS = 120;
export const PAYMENT_PROOF_SIGNED_UPLOAD_TTL_SECONDS = 300;
export const PAYMENT_PROOF_REVIEW_STATUS = "بانتظار المراجعة";
export const PAYMENT_PROOF_STORAGE_PROVIDER = "supabase";

export const UPLOAD_SESSION_STATUS_OPEN = "open";
export const UPLOAD_SESSION_STATUS_COMPLETED = "completed";
export const UPLOAD_SESSION_STATUS_FAILED = "failed";
export const UPLOAD_SESSION_STATUS_EXPIRED = "expired";
export const UPLOAD_SESSION_TTL_MINUTES = 30;

const PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;
const NONCE_PATTERN = /^[a-zA-Z0-9_-]{24,64}$/;

export function isPaymentProofStorageEnabled() {
  const flag = String(process.env.PAYMENT_PROOF_STORAGE_ENABLED || "true").trim().toLowerCase();
  return flag !== "false" && flag !== "0" && flag !== "off";
}

export function isPaymentProofLegacyReadEnabled() {
  const flag = String(process.env.PAYMENT_PROOF_LEGACY_READ_ENABLED || "true")
    .trim()
    .toLowerCase();
  return flag !== "false" && flag !== "0" && flag !== "off";
}

export function paymentProofStorageUnavailableMessage() {
  return "خدمة رفع إثبات الدفع غير متاحة حالياً. يرجى المحاولة لاحقاً.";
}

export function assertPaymentProofStorageReady() {
  if (!isPaymentProofStorageEnabled()) {
    const error = new Error(paymentProofStorageUnavailableMessage());
    error.status = 503;
    error.code = "PAYMENT_PROOF_STORAGE_DISABLED";
    throw error;
  }
}

export function generatePaymentProofNonce() {
  return randomBytes(24).toString("base64url");
}

export function extensionForMimeType(mimeType) {
  switch (String(mimeType || "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export function buildPaymentProofObjectPath({ userId, sessionId, nonce, mimeType }) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedSessionId = String(sessionId || "").trim();
  const normalizedNonce = String(nonce || "").trim();
  const ext = extensionForMimeType(mimeType);

  if (!PATH_SEGMENT_PATTERN.test(normalizedUserId)) {
    throw Object.assign(new Error("معرف المستخدم غير صالح"), { status: 400, code: "INVALID_USER_ID" });
  }
  if (!PATH_SEGMENT_PATTERN.test(normalizedSessionId)) {
    throw Object.assign(new Error("معرف جلسة الرفع غير صالح"), { status: 400, code: "INVALID_SESSION_ID" });
  }
  if (!NONCE_PATTERN.test(normalizedNonce)) {
    throw Object.assign(new Error("رمز الرفع غير صالح"), { status: 400, code: "INVALID_NONCE" });
  }
  if (!ext) {
    throw Object.assign(new Error("نوع الملف غير مدعوم"), { status: 400, code: "INVALID_UPLOAD_MIME" });
  }

  return `${normalizedUserId}/${normalizedSessionId}/${normalizedNonce}.${ext}`;
}

export function parsePaymentProofObjectPath(objectPath) {
  const normalized = String(objectPath || "").trim();
  const match = normalized.match(/^([^/]+)\/([^/]+)\/([a-zA-Z0-9_-]{24,64})\.(jpg|png|webp)$/);
  if (!match) return null;

  return {
    userId: match[1],
    sessionId: match[2],
    nonce: match[3],
    extension: match[4],
  };
}

export function assertPaymentProofPathOwnedBySession(objectPath, { userId, sessionId }) {
  const parsed = parsePaymentProofObjectPath(objectPath);
  if (!parsed) {
    throw Object.assign(new Error("مسار إثبات الدفع غير صالح"), { status: 400, code: "INVALID_OBJECT_PATH" });
  }
  if (parsed.userId !== String(userId || "").trim()) {
    throw Object.assign(new Error("مسار إثبات الدفع لا يخص هذا المستخدم"), {
      status: 403,
      code: "PATH_USER_MISMATCH",
    });
  }
  if (parsed.sessionId !== String(sessionId || "").trim()) {
    throw Object.assign(new Error("مسار إثبات الدفع لا يطابق جلسة الرفع"), {
      status: 400,
      code: "PATH_SESSION_MISMATCH",
    });
  }
  return parsed;
}

/** @deprecated use assertPaymentProofPathOwnedBySession — kept for legacy migration paths using request id segment */
export function assertPaymentProofPathOwnedByUser(objectPath, { userId, requestId }) {
  return assertPaymentProofPathOwnedBySession(objectPath, { userId, sessionId: requestId });
}

export function detectImageMimeFromMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  const riff = buffer.subarray(0, 4).toString("ascii");
  const webp = buffer.subarray(8, 12).toString("ascii");
  if (riff === "RIFF" && webp === "WEBP") {
    return "image/webp";
  }

  return null;
}

export function validatePaymentProofFileBuffer(buffer, { declaredMime = null, declaredSize = null } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) {
    return { ok: false, code: "EMPTY_UPLOAD" };
  }
  if (bytes.length > PAYMENT_PROOF_MAX_BYTES) {
    return { ok: false, code: "UPLOAD_TOO_LARGE" };
  }

  const normalizedDeclaredSize = Number(declaredSize || 0);
  if (Number.isFinite(normalizedDeclaredSize) && normalizedDeclaredSize > 0 && bytes.length !== normalizedDeclaredSize) {
    return { ok: false, code: "SIZE_MISMATCH" };
  }

  const detectedMime = detectImageMimeFromMagicBytes(bytes);
  if (!detectedMime || !validateAllowedImageMimeType(detectedMime)) {
    return { ok: false, code: "INVALID_UPLOAD_MIME" };
  }

  const normalizedDeclared = String(declaredMime || "")
    .trim()
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");

  if (normalizedDeclared && normalizedDeclared !== detectedMime) {
    return { ok: false, code: "MIME_MISMATCH" };
  }

  return {
    ok: true,
    mime: detectedMime,
    bytes: bytes.length,
    extension: extensionForMimeType(detectedMime),
  };
}

export async function createPaymentProofSignedUploadUrl(supabase, objectPath) {
  const { data, error } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .createSignedUploadUrl(objectPath, PAYMENT_PROOF_SIGNED_UPLOAD_TTL_SECONDS);

  if (error) {
    throw Object.assign(new Error("تعذر إعداد رفع إثبات الدفع"), {
      status: 503,
      code: "SIGNED_UPLOAD_URL_FAILED",
      cause: error,
    });
  }

  return {
    signedUrl: data?.signedUrl || data?.signedURL || null,
    token: data?.token || null,
    path: objectPath,
    expiresIn: PAYMENT_PROOF_SIGNED_UPLOAD_TTL_SECONDS,
  };
}

export async function createPaymentProofSignedReadUrl(supabase, objectPath) {
  const { data, error } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .createSignedUrl(objectPath, PAYMENT_PROOF_SIGNED_READ_TTL_SECONDS);

  if (error) {
    throw Object.assign(new Error("تعذر إنشاء رابط معاينة إثبات الدفع"), {
      status: 502,
      code: "SIGNED_READ_URL_FAILED",
      cause: error,
    });
  }

  return {
    signedUrl: data?.signedUrl || null,
    expiresIn: PAYMENT_PROOF_SIGNED_READ_TTL_SECONDS,
  };
}

export async function downloadPaymentProofObject(supabase, objectPath) {
  const { data, error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).download(objectPath);
  if (error) {
    const message = String(error?.message || "").toLowerCase();
    const notFound =
      error?.statusCode === 404 ||
      error?.status === 404 ||
      message.includes("not found") ||
      message.includes("object not found");
    throw Object.assign(new Error("ملف إثبات الدفع غير موجود"), {
      status: notFound ? 404 : 502,
      code: notFound ? "OBJECT_NOT_FOUND" : "OBJECT_DOWNLOAD_FAILED",
      cause: error,
    });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length > PAYMENT_PROOF_MAX_BYTES) {
    throw Object.assign(new Error("حجم إثبات الدفع أكبر من المسموح"), {
      status: 413,
      code: "UPLOAD_TOO_LARGE",
    });
  }

  return buffer;
}

export async function deletePaymentProofObject(supabase, objectPath) {
  const { error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).remove([objectPath]);
  if (error) {
    throw Object.assign(new Error("تعذر حذف ملف إثبات الدفع"), { status: 500, cause: error });
  }
  return { deleted: true };
}

export function hasStoredPaymentProof(row = {}) {
  return Boolean(String(row.payment_proof_path || "").trim());
}

export function hasLegacyPaymentProof(row = {}) {
  return Boolean(String(row.payment_proof || "").trim());
}

export function hasAnyPaymentProof(row = {}) {
  return hasStoredPaymentProof(row) || hasLegacyPaymentProof(row);
}

export function isUploadSessionExpired(sessionRow) {
  if (!sessionRow?.expires_at) return true;
  const expiresAt = Date.parse(String(sessionRow.expires_at));
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

export function uploadSessionExpiresAtFromNow(minutes = UPLOAD_SESSION_TTL_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}
