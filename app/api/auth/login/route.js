import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getClientIp,
  loginIpLimiter,
  RATE_LIMIT_ERROR,
} from "../../../../lib/rate-limit";
import { getSupabaseAdmin } from "../../../../lib/auth-session.js";
import { resolveIamContext } from "../../../../lib/iam/resolve-permissions.js";
import { startAdminSessionLog } from "../../../../lib/iam/session-log.js";
import { recordAdminLoginEvent } from "../../../../lib/iam/auth-events.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createAuthClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase auth configuration");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSafeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name:
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "مستخدم",
  };
}

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimitResult = await loginIpLimiter(clientIp);

    if (!rateLimitResult.success) {
      return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    const { email, password } = await request.json();

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!email || !password) {
      return NextResponse.json(
        { error: "يرجى إدخال البريد الإلكتروني وكلمة المرور" },
        { status: 400 }
      );
    }

    const supabase = createAuthClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: String(password),
    });

    if (error || !data?.session || !data?.user) {
      const adminSupabase = getSupabaseAdmin();
      await recordAdminLoginEvent(adminSupabase, {
        success: false,
        email: normalizedEmail,
        request,
      });
      return NextResponse.json(
        { error: "بيانات الدخول غير صحيحة" },
        { status: 401 }
      );
    }

    const adminSupabase = getSupabaseAdmin();
    const iam = await resolveIamContext(adminSupabase, data.user);
    const isAdmin = Boolean(iam.isAdmin);

    const sessionLog = isAdmin
      ? await startAdminSessionLog(adminSupabase, {
          userId: data.user.id,
          token: data.session.access_token,
          ipAddress: clientIp,
          userAgent: request.headers.get("user-agent"),
          isAdminSession: true,
          roleIds: iam.roleIds || [],
        })
      : null;

    await recordAdminLoginEvent(adminSupabase, {
      success: true,
      userId: data.user.id,
      email: data.user.email,
      isAdmin,
      sessionLogId: sessionLog?.sessionLogId,
      request,
    });

    const response = NextResponse.json({
      success: true,
      user: getSafeUser(data.user),
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type || "bearer",
      },
    });

    const isProduction = process.env.NODE_ENV === "production";

    const accessTokenMaxAge = Number(data.session.expires_in || 3600);

    const accessCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: accessTokenMaxAge,
    };

    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    };

    response.cookies.set(
      "hc_access_token",
      data.session.access_token,
      accessCookieOptions
    );

    response.cookies.set(
      "hc_refresh_token",
      data.session.refresh_token,
      refreshCookieOptions
    );

    return response;
  } catch (error) {
    console.error("Login API error");
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسجيل الدخول" },
      { status: 500 }
    );
  }
}
