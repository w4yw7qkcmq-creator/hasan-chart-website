import crypto from "crypto";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "./auth-session";

export const FALLBACK_ADMIN_EMAILS = ["ahmaagahmaadd@gmail.com"];

function secureCompare(provided, expected) {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function getCronSecretFromRequest(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || "";

  return bearer || headerSecret;
}

export function verifyCronSecret(request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Cron secret is not configured on the server.",
    };
  }

  const provided = getCronSecretFromRequest(request);

  if (!secureCompare(provided, secret)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized cron request.",
    };
  }

  return { ok: true };
}

export async function verifyAdminSession() {
  const supabase = getSupabaseAdmin();
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "يجب تسجيل الدخول أولاً",
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: "جلسة غير صالحة",
    };
  }

  const normalizedEmail = (user.email || "").toLowerCase();

  const { data: adminProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,role")
    .or(`id.eq.${user.id},email.eq.${normalizedEmail}`)
    .maybeSingle();

  const isAdminByProfile = adminProfile?.role === "admin";
  const isAdminByFallback = FALLBACK_ADMIN_EMAILS.includes(normalizedEmail);

  if (!isAdminByFallback && (profileError || !isAdminByProfile)) {
    return {
      ok: false,
      status: 403,
      error: "غير مصرح لك بالدخول",
    };
  }

  return {
    ok: true,
    user,
    supabase,
  };
}

export async function verifyAdminOrCronSecret(request) {
  const cronCheck = verifyCronSecret(request);
  if (cronCheck.ok) {
    return { ok: true, via: "cron", supabase: getSupabaseAdmin() };
  }

  const adminCheck = await verifyAdminSession();
  if (adminCheck.ok) {
    return {
      ok: true,
      via: "admin",
      user: adminCheck.user,
      supabase: adminCheck.supabase,
    };
  }

  if (process.env.CRON_SECRET?.trim()) {
    return cronCheck;
  }

  return adminCheck;
}
