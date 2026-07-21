import { resolveUserRole } from "./admin-emails";
import {
  buildAuthenticatedRestoreResult,
  buildTransientRestoreResult,
  buildUnauthenticatedRestoreResult,
  classifySessionRestoreResponse,
  shouldRetrySessionRestore,
} from "./auth-session-restore";
import { supabase } from "./supabase";

const SESSION_FETCH_MAX_ATTEMPTS = 3;
const SESSION_FETCH_RETRY_DELAY_MS = 250;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function buildAppUserFromSessionPayload(sessionUser) {
  if (!sessionUser?.email) return null;

  const email = String(sessionUser.email).trim();

  return {
    id: sessionUser.id,
    email,
    username: email.split("@")[0] || "مستخدم",
    telegram: "",
    role: sessionUser.role || resolveUserRole(email, null),
    subscription_plan: "بدون اشتراك",
    subscription_status: "غير نشط",
    hasSpot: false,
    hasFutures: false,
  };
}

export function buildMinimalAppUser(authUser) {
  if (!authUser?.email) return null;

  return {
    id: authUser.id,
    email: authUser.email,
    username:
      authUser.user_metadata?.username ||
      authUser.email.split("@")[0] ||
      "مستخدم",
    telegram: authUser.user_metadata?.telegram || "",
    role: resolveUserRole(authUser.email, authUser.user_metadata?.role),
    subscription_plan: "بدون اشتراك",
    subscription_status: "غير نشط",
    hasSpot: false,
    hasFutures: false,
  };
}

async function fetchSessionPayloadOnce() {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  const classification = classifySessionRestoreResponse(response, payload);

  return { response, payload, classification };
}

async function fetchSessionPayloadWithRetry() {
  let lastClassification = { outcome: "transient_error", reason: "network_error" };

  for (let attempt = 1; attempt <= SESSION_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await fetchSessionPayloadOnce();
      lastClassification = result.classification;

      if (result.classification.outcome === "authenticated") {
        return result;
      }

      if (result.classification.outcome === "unauthenticated") {
        return result;
      }

      if (!shouldRetrySessionRestore(result.classification.outcome, attempt, SESSION_FETCH_MAX_ATTEMPTS)) {
        return result;
      }
    } catch (err) {
      lastClassification = { outcome: "transient_error", reason: err?.message || "fetch_failed" };

      if (!shouldRetrySessionRestore("transient_error", attempt, SESSION_FETCH_MAX_ATTEMPTS)) {
        return { response: null, payload: {}, classification: lastClassification };
      }
    }

    await wait(SESSION_FETCH_RETRY_MS * attempt);
  }

  return { response: null, payload: {}, classification: lastClassification };
}

export async function restoreSessionFromCookies() {
  try {
    const { payload, classification } = await fetchSessionPayloadWithRetry();

    if (classification.outcome === "transient_error") {
      return buildTransientRestoreResult(classification.reason);
    }

    if (classification.outcome !== "authenticated") {
      return buildUnauthenticatedRestoreResult();
    }

    const { error } = await supabase.auth.setSession({
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token,
    });

    if (error) {
      console.warn("restoreSessionFromCookies setSession skipped:", error.message);
      return buildAuthenticatedRestoreResult(payload, { clientRestored: false });
    }

    return buildAuthenticatedRestoreResult(payload, { clientRestored: true });
  } catch (err) {
    console.warn("restoreSessionFromCookies failed:", err?.message || err);
    return buildTransientRestoreResult(err?.message || "restore_failed");
  }
}

/** Apply tokens from server login/register responses to the in-memory Supabase client. */
export async function applyClientSession(session) {
  if (!session?.access_token || !session?.refresh_token) {
    return { ok: false, user: null };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error || !data?.user?.email) {
    return { ok: false, user: null, error };
  }

  return { ok: true, user: data.user };
}

export async function resolveSupabaseAuthUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.email) {
    return { user: session.user, error: null };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
}

export function syncSessionCookies(session) {
  if (!session?.access_token || !session?.refresh_token) {
    return;
  }

  void fetch("/api/auth/sync-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    }),
  }).catch(() => {});
}
