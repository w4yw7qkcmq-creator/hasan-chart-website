import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

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

function isRateLimited(identifier) {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier) || [];

  const recentAttempts = attempts.filter(
    (timestamp) => now - timestamp < WINDOW_MS
  );

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return true;
  }

  recentAttempts.push(now);
  loginAttempts.set(identifier, recentAttempts);
  return false;
}

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (isRateLimited(normalizedEmail)) {
      return NextResponse.json(
        {
          error: "تم تجاوز عدد محاولات تسجيل الدخول. حاول مرة أخرى بعد 15 دقيقة.",
        },
        { status: 429 }
      );
    }

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
      return NextResponse.json(
        { error: "بيانات الدخول غير صحيحة" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: getSafeUser(data.user),
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