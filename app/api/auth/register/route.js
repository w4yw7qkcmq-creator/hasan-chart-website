import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { linkPartnerRegistration } from "../../../../lib/partner-server";
import { REFERRAL_COOKIE_NAME, sanitizeReferralCode } from "../../../../lib/partner-shared";
import {
  getClientIp,
  registerIpLimiter,
  RATE_LIMIT_ERROR,
} from "../../../../lib/rate-limit";
import {
  TURNSTILE_REGISTRATION_ERROR_AR,
  verifyTurnstileTokenServer,
} from "../../../../lib/turnstile-server";

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

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimitResult = await registerIpLimiter(clientIp);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: RATE_LIMIT_ERROR },
        { status: 429 }
      );
    }

    const { email, password, username, telegram, turnstileToken } = await request.json();

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const cleanUsername = String(username || "").trim();
    const cleanTelegram = String(telegram || "").trim();

    if (!normalizedEmail || !password || !cleanUsername) {
      return NextResponse.json(
        {
          success: false,
          error: "يرجى إدخال اسم المستخدم والبريد الإلكتروني وكلمة المرور",
        },
        { status: 400 }
      );
    }

    const captcha = await verifyTurnstileTokenServer({
      token: turnstileToken,
      remoteIp: clientIp,
    });
    if (!captcha.ok) {
      return NextResponse.json(
        { success: false, error: captcha.error || TURNSTILE_REGISTRATION_ERROR_AR },
        { status: captcha.status || 403 }
      );
    }

    const supabase = createAuthClient();

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: String(password),
      options: {
        data: {
          username: cleanUsername,
          telegram: cleanTelegram,
          role: "user",
        },
      },
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || "حدث خطأ أثناء إنشاء الحساب",
        },
        { status: 400 }
      );
    }

    const newUserId = signUpData?.user?.id;

    if (newUserId) {
      try {
        const cookieStore = await cookies();
        const referralCode = sanitizeReferralCode(
          cookieStore.get(REFERRAL_COOKIE_NAME)?.value
        );

        if (referralCode) {
          const admin = getSupabaseAdmin();

          await linkPartnerRegistration(admin, {
            newUserId,
            newUsername: cleanUsername,
            referralCode,
          });
        }
      } catch (partnerError) {
        console.error("Partner registration hook failed");
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register API error");
    return NextResponse.json(
      { success: false, error: "حدث خطأ أثناء إنشاء الحساب" },
      { status: 500 }
    );
  }
}
