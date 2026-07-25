import { getSupabaseAdmin } from "./auth-session.js";
import { requireValidUuid } from "./id-validation.js";
import {
  PAYMENT_PROOF_REVIEW_STATUS,
  PAYMENT_PROOF_STORAGE_PROVIDER,
  UPLOAD_SESSION_STATUS_COMPLETED,
  UPLOAD_SESSION_STATUS_FAILED,
  UPLOAD_SESSION_STATUS_OPEN,
  assertPaymentProofPathOwnedBySession,
  assertPaymentProofStorageReady,
  buildPaymentProofObjectPath,
  createPaymentProofSignedUploadUrl,
  deletePaymentProofObject,
  downloadPaymentProofObject,
  generatePaymentProofNonce,
  isUploadSessionExpired,
  uploadSessionExpiresAtFromNow,
  validatePaymentProofFileBuffer,
} from "./payment-proof-storage.js";

const SESSION_SELECT =
  "id,user_id,user_email,username,plan_name,category,price,telegram_username,object_path,declared_mime_type,declared_size_bytes,nonce,status,subscription_request_id,failure_reason,expires_at,completed_at,failed_at";

const REQUEST_SELECT =
  "id,user_email,status,plan_name,category,price,telegram_username,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes";

function validationFailureMessage(code) {
  switch (code) {
    case "UPLOAD_TOO_LARGE":
      return "حجم إثبات الدفع أكبر من المسموح";
    case "MIME_MISMATCH":
      return "نوع الملف لا يطابق محتواه";
    case "SIZE_MISMATCH":
      return "حجم الملف لا يطابق ما تم إرساله";
    case "EMPTY_UPLOAD":
      return "ملف إثبات الدفع فارغ";
    default:
      return "صيغة إثبات الدفع غير مدعومة";
  }
}

async function loadUploadSessionForUser(supabase, sessionId, { userId, userEmail }) {
  const normalizedSessionId = requireValidUuid(sessionId, "sessionId");
  const { data, error } = await supabase
    .from("subscription_upload_sessions")
    .select(SESSION_SELECT)
    .eq("id", normalizedSessionId)
    .eq("user_id", userId)
    .eq("user_email", userEmail)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw Object.assign(new Error("جلسة رفع إثبات الدفع غير موجودة"), {
      status: 404,
      code: "UPLOAD_SESSION_NOT_FOUND",
    });
  }
  return data;
}

async function markUploadSessionFailed(supabase, sessionId, { userId, userEmail, reason, objectPath = null }) {
  if (objectPath) {
    try {
      await deletePaymentProofObject(getSupabaseAdmin(), objectPath);
    } catch {
      // best effort
    }
  }

  const { data, error } = await supabase
    .from("subscription_upload_sessions")
    .update({
      status: UPLOAD_SESSION_STATUS_FAILED,
      failure_reason: String(reason || "validation_failed").slice(0, 120),
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("user_email", userEmail)
    .eq("status", UPLOAD_SESSION_STATUS_OPEN)
    .select("id,status,failure_reason")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function initUploadSession(
  supabase,
  {
    userId,
    userEmail,
    username,
    planName,
    category,
    price,
    telegramUsername,
  }
) {
  assertPaymentProofStorageReady();

  const { data, error } = await supabase
    .from("subscription_upload_sessions")
    .insert([
      {
        user_id: userId,
        user_email: userEmail,
        username,
        plan_name: planName,
        category,
        price,
        telegram_username: telegramUsername,
        status: UPLOAD_SESSION_STATUS_OPEN,
        expires_at: uploadSessionExpiresAtFromNow(),
      },
    ])
    .select(SESSION_SELECT)
    .single();

  if (error) {
    throw Object.assign(new Error("تعذر بدء جلسة رفع إثبات الدفع"), {
      status: 500,
      code: "UPLOAD_SESSION_INIT_FAILED",
      cause: error,
    });
  }

  return { session: data };
}

export async function authorizePaymentProofUpload(
  supabase,
  {
    userId,
    userEmail,
    sessionId,
    declaredMime,
    declaredSize,
  }
) {
  assertPaymentProofStorageReady();

  const session = await loadUploadSessionForUser(supabase, sessionId, { userId, userEmail });

  if (session.status === UPLOAD_SESSION_STATUS_COMPLETED && session.subscription_request_id) {
    throw Object.assign(new Error("تم إتمام جلسة الرفع مسبقاً"), {
      status: 409,
      code: "UPLOAD_SESSION_ALREADY_COMPLETED",
    });
  }
  if (session.status !== UPLOAD_SESSION_STATUS_OPEN) {
    throw Object.assign(new Error("حالة جلسة الرفع لا تسمح بالرفع"), {
      status: 409,
      code: "UPLOAD_SESSION_NOT_OPEN",
    });
  }
  if (isUploadSessionExpired(session)) {
    throw Object.assign(new Error("انتهت صلاحية جلسة رفع إثبات الدفع"), {
      status: 410,
      code: "UPLOAD_SESSION_EXPIRED",
    });
  }

  const normalizedSize = Number(declaredSize || 0);
  if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) {
    throw Object.assign(new Error("حجم الملف غير صالح"), { status: 400, code: "INVALID_DECLARED_SIZE" });
  }
  if (normalizedSize > 8 * 1024 * 1024) {
    throw Object.assign(new Error("حجم إثبات الدفع أكبر من المسموح"), {
      status: 413,
      code: "UPLOAD_TOO_LARGE",
    });
  }

  const existingPath = String(session.object_path || "").trim();
  const nonce = existingPath ? session.nonce || generatePaymentProofNonce() : generatePaymentProofNonce();
  const objectPath =
    existingPath ||
    buildPaymentProofObjectPath({
      userId,
      sessionId: session.id,
      nonce,
      mimeType: declaredMime,
    });

  assertPaymentProofPathOwnedBySession(objectPath, { userId, sessionId: session.id });

  const admin = getSupabaseAdmin();
  const signed = await createPaymentProofSignedUploadUrl(admin, objectPath);

  if (!existingPath) {
    const { error: updateError } = await supabase
      .from("subscription_upload_sessions")
      .update({
        object_path: objectPath,
        nonce,
        declared_mime_type: declaredMime,
        declared_size_bytes: normalizedSize,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("user_id", userId)
      .eq("status", UPLOAD_SESSION_STATUS_OPEN);

    if (updateError) {
      throw Object.assign(new Error("تعذر حفظ بيانات رفع إثبات الدفع"), {
        status: 500,
        code: "UPLOAD_SESSION_UPDATE_FAILED",
        cause: updateError,
      });
    }
  }

  return {
    sessionId: session.id,
    objectPath,
    nonce,
    upload: signed,
  };
}

async function loadCompletedRequestForSession(supabase, session) {
  const requestId = String(session.subscription_request_id || "").trim();
  if (!requestId) return null;

  const { data, error } = await supabase
    .from("subscription_requests")
    .select(REQUEST_SELECT)
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function finalizePaymentProofUpload(
  supabase,
  {
    userId,
    userEmail,
    sessionId,
    objectPath,
    declaredMime = null,
  }
) {
  assertPaymentProofStorageReady();

  const normalizedSessionId = requireValidUuid(sessionId, "sessionId");
  const session = await loadUploadSessionForUser(supabase, normalizedSessionId, { userId, userEmail });

  if (session.status === UPLOAD_SESSION_STATUS_COMPLETED && session.subscription_request_id) {
    const existingRequest = await loadCompletedRequestForSession(supabase, session);
    if (existingRequest?.id) {
      return { request: existingRequest, duplicate: true, sessionId: session.id };
    }
  }

  if (session.status !== UPLOAD_SESSION_STATUS_OPEN) {
    throw Object.assign(new Error("حالة جلسة الرفع لا تسمح بإتمام الطلب"), {
      status: 409,
      code: "UPLOAD_SESSION_NOT_OPEN",
    });
  }

  if (isUploadSessionExpired(session)) {
    await markUploadSessionFailed(supabase, session.id, {
      userId,
      userEmail,
      reason: "session_expired",
      objectPath: session.object_path,
    }).catch(() => {});
    throw Object.assign(new Error("انتهت صلاحية جلسة رفع إثبات الدفع"), {
      status: 410,
      code: "UPLOAD_SESSION_EXPIRED",
    });
  }

  const normalizedObjectPath = String(objectPath || "").trim();
  const sessionObjectPath = String(session.object_path || "").trim();
  if (!sessionObjectPath || sessionObjectPath !== normalizedObjectPath) {
    throw Object.assign(new Error("مسار إثبات الدفع لا يطابق جلسة الرفع"), {
      status: 400,
      code: "OBJECT_PATH_MISMATCH",
    });
  }

  assertPaymentProofPathOwnedBySession(normalizedObjectPath, { userId, sessionId: session.id });

  const { data: existingByPath, error: existingByPathError } = await supabase
    .from("subscription_requests")
    .select(REQUEST_SELECT)
    .eq("payment_proof_path", normalizedObjectPath)
    .maybeSingle();

  if (existingByPathError) throw existingByPathError;
  if (existingByPath?.id) {
    await supabase
      .from("subscription_upload_sessions")
      .update({
        status: UPLOAD_SESSION_STATUS_COMPLETED,
        subscription_request_id: existingByPath.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("user_id", userId)
      .in("status", [UPLOAD_SESSION_STATUS_OPEN, UPLOAD_SESSION_STATUS_COMPLETED])
      .catch(() => {});

    return { request: existingByPath, duplicate: true, sessionId: session.id };
  }

  const admin = getSupabaseAdmin();
  let buffer;
  try {
    buffer = await downloadPaymentProofObject(admin, normalizedObjectPath);
  } catch (downloadError) {
    if (downloadError?.code === "OBJECT_NOT_FOUND") {
      await markUploadSessionFailed(supabase, session.id, {
        userId,
        userEmail,
        reason: "object_not_found",
        objectPath: normalizedObjectPath,
      }).catch(() => {});
    }
    throw downloadError;
  }

  const validation = validatePaymentProofFileBuffer(buffer, {
    declaredMime: declaredMime || session.declared_mime_type,
    declaredSize: session.declared_size_bytes,
  });

  if (!validation.ok) {
    await markUploadSessionFailed(supabase, session.id, {
      userId,
      userEmail,
      reason: validation.code,
      objectPath: normalizedObjectPath,
    }).catch(() => {});
    throw Object.assign(new Error(validationFailureMessage(validation.code)), {
      status: 400,
      code: validation.code,
    });
  }

  const uploadedAt = new Date().toISOString();
  const { data: createdRequest, error: insertError } = await supabase
    .from("subscription_requests")
    .insert([
      {
        user_email: session.user_email,
        username: session.username,
        plan_name: session.plan_name,
        category: session.category,
        price: session.price,
        telegram_username: session.telegram_username,
        status: PAYMENT_PROOF_REVIEW_STATUS,
        payment_proof: null,
        payment_proof_path: normalizedObjectPath,
        payment_proof_mime_type: validation.mime,
        payment_proof_size_bytes: validation.bytes,
        payment_proof_uploaded_at: uploadedAt,
        payment_proof_storage_provider: PAYMENT_PROOF_STORAGE_PROVIDER,
      },
    ])
    .select(REQUEST_SELECT)
    .single();

  if (insertError) {
    throw Object.assign(new Error("تعذر إنشاء طلب الاشتراك"), {
      status: 500,
      code: "SUBSCRIPTION_REQUEST_INSERT_FAILED",
      cause: insertError,
    });
  }

  const { data: completedSession, error: completeError } = await supabase
    .from("subscription_upload_sessions")
    .update({
      status: UPLOAD_SESSION_STATUS_COMPLETED,
      subscription_request_id: createdRequest.id,
      completed_at: uploadedAt,
      updated_at: uploadedAt,
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .eq("user_email", userEmail)
    .eq("status", UPLOAD_SESSION_STATUS_OPEN)
    .select("id,status,subscription_request_id")
    .maybeSingle();

  if (completeError) {
    throw Object.assign(new Error("تعذر إتمام جلسة رفع إثبات الدفع"), {
      status: 500,
      code: "UPLOAD_SESSION_COMPLETE_FAILED",
      cause: completeError,
    });
  }

  if (!completedSession?.id) {
    const racedSession = await loadUploadSessionForUser(supabase, session.id, { userId, userEmail });
    if (racedSession.status === UPLOAD_SESSION_STATUS_COMPLETED && racedSession.subscription_request_id) {
      const existingRequest = await loadCompletedRequestForSession(supabase, racedSession);
      if (existingRequest?.id) {
        return { request: existingRequest, duplicate: true, sessionId: session.id };
      }
    }
    throw Object.assign(new Error("تعذر إتمام جلسة رفع إثبات الدفع"), {
      status: 409,
      code: "UPLOAD_SESSION_RACE",
    });
  }

  return { request: createdRequest, duplicate: false, sessionId: session.id };
}
