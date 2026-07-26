import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { instrumentSupabaseClient } from "./supabase-dev-metrics";

function readJwtRole(key) {
  try {
    const parts = String(key || "").split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );

    return payload?.role || null;
  } catch {
    return null;
  }
}

function assertServiceRoleKey(serviceRoleKey, anonKey) {
  const normalizedKey = String(serviceRoleKey || "").trim();

  if (!normalizedKey) {
    throw new Error("Missing Supabase configuration");
  }

  if (
    (anonKey && normalizedKey === String(anonKey).trim()) ||
    normalizedKey.startsWith("sb_publishable_")
  ) {
    throw new Error("Invalid Supabase service role key");
  }

  const jwtRole = readJwtRole(normalizedKey);

  if (jwtRole && jwtRole !== "service_role") {
    throw new Error(`Invalid Supabase service role key (role=${jwtRole})`);
  }

  return normalizedKey;
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = assertServiceRoleKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

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

export async function requireSessionUser() {
  const supabase = getSupabaseAdmin();
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
