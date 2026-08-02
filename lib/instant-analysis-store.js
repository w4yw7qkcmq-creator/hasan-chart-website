import { getSupabaseAdmin } from "./supabase-admin";
import { mapRpcAvailability } from "./instant-analysis-cooldown";

function unwrapRpcError(error, fallbackCode = "INSTANT_ANALYSIS_DB_ERROR") {
  return {
    ok: false,
    code: fallbackCode,
    message: "تعذر معالجة طلب التحليل اللحظي حالياً.",
    details: error?.message || String(error),
  };
}

export async function getInstantAnalysisAvailability(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("get_instant_analysis_availability", {
    p_user_id: userId,
  });

  if (error) {
    return unwrapRpcError(error);
  }

  return {
    ok: true,
    availability: mapRpcAvailability(data || {}),
  };
}

export async function reserveInstantAnalysisRequest(userId, symbol) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("reserve_instant_analysis_request", {
    p_user_id: userId,
    p_symbol: symbol,
  });

  if (error) {
    return unwrapRpcError(error);
  }

  if (!data?.ok) {
    return {
      ok: false,
      code: data?.code || "INSTANT_ANALYSIS_COOLDOWN",
      retryAfterSeconds: Math.max(0, Number(data?.retry_after_seconds) || 0),
      nextAllowedAt:
        typeof data?.next_allowed_at === "string"
          ? data.next_allowed_at
          : data?.next_allowed_at
            ? String(data.next_allowed_at)
            : null,
    };
  }

  return {
    ok: true,
    requestId: data.request_id,
  };
}

export async function confirmInstantAnalysisJob(requestId, userId, jobId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("confirm_instant_analysis_job", {
    p_request_id: requestId,
    p_user_id: userId,
    p_job_id: jobId,
  });

  if (error) {
    return unwrapRpcError(error);
  }

  if (!data?.ok) {
    return {
      ok: false,
      code: data?.code || "REQUEST_NOT_FOUND",
    };
  }

  return {
    ok: true,
    cooldownStartsAt: data.cooldown_starts_at || null,
  };
}

export async function releaseInstantAnalysisReservation(requestId, userId, errorCode) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("release_instant_analysis_reservation", {
    p_request_id: requestId,
    p_user_id: userId,
    p_error_code: errorCode || null,
  });

  if (error) {
    return unwrapRpcError(error);
  }

  return { ok: Boolean(data?.ok) };
}

export async function findInstantAnalysisRequestByJobId(userId, jobId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instant_analysis_requests")
    .select("id, user_id, job_id, status, symbol, cooldown_starts_at")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) {
    return unwrapRpcError(error);
  }

  if (!data) {
    return { ok: false, code: "JOB_NOT_FOUND" };
  }

  return { ok: true, request: data };
}

export async function updateInstantAnalysisRequestStatus(requestId, userId, status, errorCode) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("update_instant_analysis_request_status", {
    p_request_id: requestId,
    p_user_id: userId,
    p_status: status,
    p_error_code: errorCode || null,
  });

  if (error) {
    return unwrapRpcError(error);
  }

  return { ok: Boolean(data?.ok) };
}
