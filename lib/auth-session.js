import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { instrumentSupabaseClient } from "./supabase-dev-metrics";
import { assertServiceRoleKeyFromEnv } from "./auth-session-internals.js";
import { getRequestSupabaseAdmin } from "./iam/request-context.js";

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = assertServiceRoleKeyFromEnv();

  if (!supabaseUrl) {
    throw new Error("Missing Supabase configuration");
  }

  return instrumentSupabaseClient(
    createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  );
}

/** Prefer in admin/IAM paths — reuses one client per HTTP request when available. */
export async function getSupabaseAdminForRequest() {
  try {
    return await getRequestSupabaseAdmin();
  } catch {
    return getSupabaseAdmin();
  }
}

export async function requireSessionUser() {
  const supabase = await getSupabaseAdminForRequest();
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;

  if (!token) {
    return { error: "UNAUTHORIZED" };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.id || !user?.email) {
    return { error: "UNAUTHORIZED" };
  }

  return {
    id: user.id,
    email: String(user.email).trim().toLowerCase(),
    username:
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      user.email.split("@")[0] ||
      "مستخدم",
    supabase,
  };
}

export async function requireSessionEmail() {
  const session = await requireSessionUser();

  if (session.error) {
    return session;
  }

  return {
    email: session.email,
    supabase: session.supabase,
  };
}

export async function getOptionalSessionUser() {
  const session = await requireSessionUser();

  if (session.error) {
    return null;
  }

  return session;
}
