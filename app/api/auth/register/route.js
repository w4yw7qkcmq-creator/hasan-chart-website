import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { linkPartnerRegistration } from "../../../../lib/partner-server";
import { REFERRAL_COOKIE_NAME, VISITOR_COOKIE_NAME, sanitizeReferralCode } from "../../../../lib/partner-shared";
import {
  getClientIp,
  registerIpLimiter,
  RATE_LIMIT_ERROR,
} from "../../../../lib/rate-limit";
import {
  TURNSTILE_REGISTRATION_ERROR_AR,
  verifyTurnstileTokenServer,
} from "../../../../lib/turnstile-server";
import { readDeviceTokenFromRequest, attachDeviceCookie } from "../../../../lib/security/device-identity.js";
import { markTurnstileVerified } from "../../../../lib/security/human-verification.js";
import {
  computeSignupVelocityContext,
  recordSignupRiskSignals,
} from "../../../../lib/security/account-risk-signals.js";
import { isHumanVerificationEnabled } from "../../../../lib/security/feature-flags.js";

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

    const deviceState = readDeviceTokenFromRequest(request);
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
      expectedAction: "register",
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
    const admin = getSupabaseAdmin();
    const cookieStore = await cookies();
    const referralCode = sanitizeReferralCode(cookieStore.get(REFERRAL_COOKIE_NAME)?.value);
    const visitorKey = cookieStore.get(VISITOR_COOKIE_NAME)?.value || null;

    if (newUserId && isHumanVerificationEnabled()) {
      try {
        await markTurnstileVerified(admin, newUserId);
      } catch (hvError) {
        console.error("Signup human verification persistence failed");
      }

      try {
        await recordSignupRiskSignals(admin, {
          userId: newUserId,
          clientIp,
          deviceToken: deviceState.token,
          visitorKey,
          deviceTampered: deviceState.tampered,
        });
      } catch (signalError) {
        console.error("Signup risk signal capture failed");
      }
    }

    if (newUserId && referralCode) {
      try {
        const velocity = await computeSignupVelocityContext(admin, {
          clientIp,
          deviceToken: deviceState.token,
          partnerId: null,
        }).catch(() => null);

        await linkPartnerRegistration(admin, {
          newUserId,
          newUsername: cleanUsername,
          referralCode,
          clientIp,
          deviceToken: deviceState.token,
          visitorKey,
          velocityContext: velocity,
          email: normalizedEmail,
        });
      } catch {
        console.error("Partner registration hook failed");
      }
    }

    const response = NextResponse.json({ success: true });
    if (deviceState.issued && deviceState.token) {
      attachDeviceCookie(response, deviceState.token);
    }
    return response;
  } catch (error) {
    console.error("Register API error");
    return NextResponse.json(
      { success: false, error: "حدث خطأ أثناء إنشاء الحساب" },
      { status: 500 }
    );
  }
}
