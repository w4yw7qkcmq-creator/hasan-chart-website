import { buildAppUser } from "./auth-profile";
import { supabase } from "./supabase";

let bootstrapPromise = null;

export function resetAuthBootstrap() {
  bootstrapPromise = null;
}

export async function runAuthBootstrap() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => ({}));

      if (response.ok && payload?.session?.access_token && payload?.session?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession(payload.session);

        if (sessionError) {
          return { status: "unauthenticated", user: null };
        }
      }

      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !authUser?.email) {
        return { status: "unauthenticated", user: null };
      }

      const appUser = await buildAppUser(authUser, supabase);

      if (!appUser) {
        return { status: "unauthenticated", user: null };
      }

      return { status: "authenticated", user: appUser };
    } catch {
      return { status: "unauthenticated", user: null };
    }
  })();

  return bootstrapPromise;
}

export async function applySessionAfterLogin(session) {
  resetAuthBootstrap();

  if (session?.access_token && session?.refresh_token) {
    const { error } = await supabase.auth.setSession(session);

    if (error) {
      return { status: "unauthenticated", user: null };
    }
  }

  const {
    data: { user: authUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !authUser?.email) {
    return { status: "unauthenticated", user: null };
  }

  const appUser = await buildAppUser(authUser, supabase);

  if (!appUser) {
    return { status: "unauthenticated", user: null };
  }

  const result = { status: "authenticated", user: appUser };
  bootstrapPromise = Promise.resolve(result);

  return result;
}
