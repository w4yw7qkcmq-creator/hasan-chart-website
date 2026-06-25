import { resolveUserRole } from "./admin-emails";
import { supabase } from "./supabase";

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
  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (
      !payload?.authenticated ||
      !payload?.session?.access_token ||
      !payload?.session?.refresh_token
    ) {
      return false;
    }

    const { error } = await supabase.auth.setSession(payload.session);
    return !error;
  } catch {
    return false;
  }
}

export async function resolveSupabaseAuthUser() {
  await supabase.auth.getSession();

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
