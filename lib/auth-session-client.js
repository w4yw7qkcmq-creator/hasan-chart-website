import { resolveUserRole } from "./admin-emails";
import { supabase } from "./supabase";

const AUTH_STEP_TIMEOUT_MS = 8_000;

function withAuthTimeout(promise, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), AUTH_STEP_TIMEOUT_MS);
    }),
  ]);
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

export async function restoreSessionFromCookies() {
  const empty = { restored: false, sessionUser: null, isAdmin: false };

  try {
    const response = await withAuthTimeout(
      fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
      null
    );

    if (!response?.ok) {
      return empty;
    }

    const payload = await response.json().catch(() => ({}));

    if (
      !payload?.authenticated ||
      !payload?.session?.access_token ||
      !payload?.session?.refresh_token
    ) {
      return empty;
    }

    const sessionUser = payload?.user?.email ? payload.user : null;
    const isAdmin = Boolean(payload?.isAdmin);

    const { error } = await withAuthTimeout(
      supabase.auth.setSession({
        access_token: payload.session.access_token,
        refresh_token: payload.session.refresh_token,
      }),
      { data: { session: null }, error: new Error("setSession timeout") }
    );

    if (error) {
      console.warn("restoreSessionFromCookies setSession skipped:", error.message);
      return { restored: false, sessionUser, isAdmin };
    }

    return { restored: true, sessionUser, isAdmin };
  } catch (err) {
    console.warn("restoreSessionFromCookies failed:", err?.message || err);
    return empty;
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
  await withAuthTimeout(supabase.auth.getSession(), {
    data: { session: null },
    error: new Error("getSession timeout"),
  });

  const {
    data: { user },
    error,
  } = await withAuthTimeout(supabase.auth.getUser(), {
    data: { user: null },
    error: new Error("getUser timeout"),
  });

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
