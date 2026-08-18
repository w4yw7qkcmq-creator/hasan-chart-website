import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  enforceLoginFloodLimit,
  peekLoginFailedAuthLimits,
  recordLoginFailedAuthAttempt,
  resetLoginFailedAuthCounters,
  logLoginSuccess,
  normalizeLoginEmail,
} from "../../../../lib/auth-login-rate-limit";
import { getSupabaseAdmin } from "../../../../lib/auth-session.js";
import { resolveIamContext } from "../../../../lib/iam/resolve-permissions.js";
import { startAdminSessionLog } from "../../../../lib/iam/session-log.js";
import { recordAdminLoginEvent } from "../../../../lib/iam/auth-events.js";
import { getClientIp } from "../../../../lib/rate-limit";
import { readDeviceTokenFromRequest, attachDeviceCookie } from "../../../../lib/security/device-identity.js";
import {
  evaluateLoginPreAuthRisk,
  LOGIN_RISK_CODES,
} from "../../../../lib/security/login-risk-evaluator.js";
import {
  createLoginChallenge,
  purgeExpiredLoginChallenges,
  verifyLoginChallenge,
  consumeLoginChallenge,
} from "../../../../lib/security/login-challenge.js";
import {
  TURNSTILE_LOGIN_ERROR_AR,
  verifyTurnstileTokenServer,
  isTurnstileConfigured,
} from "../../../../lib/turnstile-server";
import { isTurnstileLoginAdaptiveEnabled } from "../../../../lib/security/feature-flags.js";
import { withBoundedTimeout, isTimeoutError } from "../../../../lib/async-bounded.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TIMEOUT_MS = Object.freeze({
  rateLimit: Number(process.env.LOGIN_RATE_LIMIT_TIMEOUT_MS) || 8000,
  riskEval: Number(process.env.LOGIN_RISK_EVAL_TIMEOUT_MS) || 8000,
  turnstile: Number(process.env.LOGIN_TURNSTILE_TIMEOUT_MS) || 10000,
  supabaseAuth: Number(process.env.LOGIN_SUPABASE_AUTH_TIMEOUT_MS) || 15000,
  iamContext: Number(process.env.LOGIN_IAM_CONTEXT_TIMEOUT_MS) || 10000,
  iamAudit: Number(process.env.LOGIN_IAM_AUDIT_TIMEOUT_MS) || 10000,
});

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

function rateLimitResponse(payload) {
  return NextResponse.json(payload.body, {
    status: payload.status,
    headers: payload.headers,
  });
}

function authDependencyFailureResponse(code, status = 503) {
  return NextResponse.json(
    {
      success: false,
      code,
      error: TURNSTILE_LOGIN_ERROR_AR,
    },
    { status }
  );
}

export async function POST(request) {
  try {
    purgeExpiredLoginChallenges();

    let floodCheck;
    try {
      floodCheck = await withBoundedTimeout(enforceLoginFloodLimit(request), TIMEOUT_MS.rateLimit, "login_flood_limit");
    } catch (error) {
      if (isTimeoutError(error)) {
        return authDependencyFailureResponse("LOGIN_RATE_LIMIT_TIMEOUT", 503);
      }
      throw error;
    }
    if (floodCheck.limited) {
      return rateLimitResponse(floodCheck);
    }

    const clientIp = floodCheck.clientIp || getClientIp(request);
    const deviceState = readDeviceTokenFromRequest(request);
    const body = await request.json();
    const { email, password, turnstileToken, challengeId } = body;

    const normalizedEmail = normalizeLoginEmail(email);

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { error: "يرجى إدخال البريد الإلكتروني وكلمة المرور" },
        { status: 400 }
      );
    }

    let failedAuthCheck;
    let loginRisk;
    try {
      [failedAuthCheck, loginRisk] = await withBoundedTimeout(
        Promise.all([
          peekLoginFailedAuthLimits({ clientIp, email: normalizedEmail }),
          evaluateLoginPreAuthRisk(request, {
            email: normalizedEmail,
            clientIp,
            deviceToken: deviceState.token,
          }),
        ]),
        TIMEOUT_MS.riskEval,
        "login_risk_eval"
      );
    } catch (error) {
      if (isTimeoutError(error)) {
        return authDependencyFailureResponse("LOGIN_RISK_TIMEOUT", 503);
      }
      throw error;
    }

    const challengeRequired =
      isTurnstileConfigured() &&
      isTurnstileLoginAdaptiveEnabled() &&
      loginRisk.risk === LOGIN_RISK_CODES.CHALLENGE;

    if (failedAuthCheck.limited && !challengeRequired) {
      return rateLimitResponse(failedAuthCheck);
    }

    const adaptiveChallengeEnabled =
      isTurnstileConfigured() && isTurnstileLoginAdaptiveEnabled();
    const challengedAttempt =
      adaptiveChallengeEnabled && Boolean(challengeId && turnstileToken);
    const mustVerifyChallenge = challengeRequired || challengedAttempt;

    if (adaptiveChallengeEnabled && turnstileToken && !challengeId) {
      return NextResponse.json(
        { success: false, code: "TURNSTILE_REQUIRED", error: TURNSTILE_LOGIN_ERROR_AR },
        { status: 403 }
      );
    }

    if (adaptiveChallengeEnabled && challengeId && !turnstileToken && !challengeRequired) {
      return NextResponse.json(
        { success: false, code: "TURNSTILE_REQUIRED", error: TURNSTILE_LOGIN_ERROR_AR },
        { status: 403 }
      );
    }

    if (challengeId && adaptiveChallengeEnabled && !mustVerifyChallenge) {
      const replayCheck = verifyLoginChallenge({
        challengeId,
        email: normalizedEmail,
        clientIp,
        deviceHash: loginRisk.deviceHash,
        consume: false,
      });
      if (!replayCheck.ok) {
        const code =
          replayCheck.reason === "challenge_replay" ? "CHALLENGE_REPLAY" : "TURNSTILE_REQUIRED";
        return NextResponse.json(
          { success: false, code, error: TURNSTILE_LOGIN_ERROR_AR },
          { status: 403 }
        );
      }
    }

    if (challengeRequired && !challengeId) {
      const challenge = createLoginChallenge({
        email: normalizedEmail,
        clientIp,
        deviceHash: loginRisk.deviceHash,
      });
      const response = NextResponse.json({
        success: false,
        code: "TURNSTILE_REQUIRED",
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
      });
      if (deviceState.issued && deviceState.token) {
        attachDeviceCookie(response, deviceState.token);
      }
      return response;
    }

    if (mustVerifyChallenge) {
      if (!turnstileToken || !challengeId) {
        return NextResponse.json(
          { success: false, code: "TURNSTILE_REQUIRED", error: TURNSTILE_LOGIN_ERROR_AR },
          { status: 403 }
        );
      }

      const challengeCheck = verifyLoginChallenge({
        challengeId,
        email: normalizedEmail,
        clientIp,
        deviceHash: loginRisk.deviceHash,
        consume: false,
      });
      if (!challengeCheck.ok) {
        const code =
          challengeCheck.reason === "challenge_replay" ? "CHALLENGE_REPLAY" : "TURNSTILE_REQUIRED";
        return NextResponse.json(
          { success: false, code, error: TURNSTILE_LOGIN_ERROR_AR },
          { status: 403 }
        );
      }

      let captcha;
      try {
        captcha = await withBoundedTimeout(
          verifyTurnstileTokenServer({
            token: turnstileToken,
            remoteIp: clientIp,
            expectedAction: "login",
          }),
          TIMEOUT_MS.turnstile,
          "turnstile_verify"
        );
      } catch (error) {
        if (isTimeoutError(error)) {
          return authDependencyFailureResponse("TURNSTILE_TIMEOUT", 504);
        }
        throw error;
      }
      if (!captcha.ok) {
        return NextResponse.json(
          { success: false, code: "TURNSTILE_REQUIRED", error: captcha.error || TURNSTILE_LOGIN_ERROR_AR },
          { status: captcha.status || 403 }
        );
      }
    }

    const supabase = createAuthClient();

    let data;
    let error;
    try {
      ({ data, error } = await withBoundedTimeout(
        supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: String(password),
        }),
        TIMEOUT_MS.supabaseAuth,
        "supabase_sign_in"
      ));
    } catch (signInTimeout) {
      if (isTimeoutError(signInTimeout)) {
        return authDependencyFailureResponse("SUPABASE_AUTH_TIMEOUT", 504);
      }
      throw signInTimeout;
    }

    if (error || !data?.session || !data?.user) {
      try {
        await withBoundedTimeout(
          recordLoginFailedAuthAttempt({
            clientIp,
            email: normalizedEmail,
          }),
          TIMEOUT_MS.rateLimit,
          "record_failed_auth"
        );
      } catch {
        // fail-closed on auth denial already handled below
      }

      try {
        const adminSupabase = getSupabaseAdmin();
        await withBoundedTimeout(
          recordAdminLoginEvent(adminSupabase, {
            success: false,
            email: normalizedEmail,
            request,
          }),
          TIMEOUT_MS.iamAudit,
          "record_failed_login_event"
        );
      } catch {
        // audit must not block failed credential response
      }

      return NextResponse.json(
        { error: "بيانات الدخول غير صحيحة" },
        { status: 401 }
      );
    }

    await resetLoginFailedAuthCounters({
      clientIp,
      email: normalizedEmail,
    }).catch(() => null);

    if (challengeId && adaptiveChallengeEnabled) {
      consumeLoginChallenge(challengeId);
    }

    logLoginSuccess({ email: normalizedEmail, clientIp });

    const adminSupabase = getSupabaseAdmin();
    let iam = { isAdmin: false, roleIds: [] };
    try {
      iam = await withBoundedTimeout(resolveIamContext(adminSupabase, data.user), TIMEOUT_MS.iamContext, "iam_context");
    } catch (iamErr) {
      if (isTimeoutError(iamErr)) {
        console.error("Login IAM context timeout");
      } else {
        throw iamErr;
      }
    }
    const isAdmin = Boolean(iam.isAdmin);

    let sessionLog = null;
    if (isAdmin) {
      try {
        sessionLog = await withBoundedTimeout(
          startAdminSessionLog(adminSupabase, {
            userId: data.user.id,
            token: data.session.access_token,
            ipAddress: clientIp,
            userAgent: request.headers.get("user-agent"),
            isAdminSession: true,
            roleIds: iam.roleIds || [],
          }),
          TIMEOUT_MS.iamAudit,
          "admin_session_log"
        );
      } catch {
        sessionLog = null;
      }
    }

    try {
      await withBoundedTimeout(
        recordAdminLoginEvent(adminSupabase, {
          success: true,
          userId: data.user.id,
          email: data.user.email,
          isAdmin,
          sessionLogId: sessionLog?.sessionLogId,
          request,
        }),
        TIMEOUT_MS.iamAudit,
        "record_success_login_event"
      );
    } catch {
      // successful auth must not hang on audit
    }

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

    response.cookies.set("hc_access_token", data.session.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: accessTokenMaxAge,
    });

    response.cookies.set("hc_refresh_token", data.session.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    if (deviceState.issued && deviceState.token) {
      attachDeviceCookie(response, deviceState.token);
    }

    return response;
  } catch (error) {
    console.error("Login API error");
    return NextResponse.json(
      { error: "حدث خطأ أثناء تسجيل الدخول" },
      { status: 500 }
    );
  }
}
