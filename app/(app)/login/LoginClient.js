"use client";

import "../../components/admin-access-loading.css";
import "./login-experience.css";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { devLog } from "../../../lib/dev-log";
import { isAdminUser } from "../../../lib/admin-emails";
import { applyClientSession } from "../../../lib/auth-session-client";
import { getSafeNextPath } from "../../../lib/safe-next-path";
import { useAppModal } from "../../components/AppModalProvider";
import { useAuth } from "../../components/AuthProvider";

function BrandMark({ size = "lg", className = "" }) {
  const box = size === "sm" ? "h-14 w-14 rounded-[22px]" : "h-20 w-20 rounded-[26px]";
  const textSize = size === "sm" ? "text-base" : "text-xl";

  return (
    <div
      className={`login-brand-mark ${className} ${box} relative grid place-items-center overflow-hidden border border-cyan-300/25 bg-gradient-to-br from-[#0b63ff]/40 via-[#00a3ff]/20 to-[#020617] shadow-[0_0_40px_rgba(0,163,255,0.28)]`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(125,211,252,0.4),transparent_38%)]" />
      <div className="relative z-10 flex flex-col items-center leading-none">
        <div className="relative mb-1 h-7 w-10">
          <span className="absolute bottom-0 end-0 h-3.5 w-1.5 rounded bg-cyan-300" />
          <span className="absolute bottom-0 end-3.5 h-5 w-1.5 rounded bg-blue-400" />
          <span className="absolute bottom-0 end-7 h-7 w-1.5 rounded bg-white" />
          <svg viewBox="0 0 80 50" className="absolute -top-0.5 end-0 h-8 w-12" fill="none" aria-hidden="true">
            <path d="M6 38 L26 24 L40 31 L68 8" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M55 7 H69 V21" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className={`${textSize} font-black tracking-tight text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]`}>HC</span>
      </div>
    </div>
  );
}

function IconEye({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-10-8-10-8a18.45 18.45 0 015.06-5.94" strokeLinecap="round" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-4.87 5.44" strokeLinecap="round" />
      <path d="M1 1l22 22" strokeLinecap="round" />
      <path d="M14.12 14.12a3 3 0 11-4.24-4.24" strokeLinecap="round" />
    </svg>
  );
}

function IconLock({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 118 0v3" strokeLinecap="round" />
    </svg>
  );
}

function IconTrending({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 5h7v7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChart({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 15v-4M12 15V9M16 15v-6" strokeLinecap="round" />
    </svg>
  );
}

function IconBell({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" />
    </svg>
  );
}

function LoginSpinner({ className = "h-5 w-5" }) {
  return (
    <svg className={`login-spinner ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 019 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function AmbientBackground() {
  return (
    <div className="login-ambient" aria-hidden="true">
      <div className="login-ambient__base" />
      <div className="login-ambient__grid" />
      <div className="login-ambient__glow login-ambient__glow--left" />
      <div className="login-ambient__glow login-ambient__glow--right" />
      <div className="login-ambient__glow login-ambient__glow--center" />
    </div>
  );
}

function MarketChartVisual() {
  const chartPoints = [
    [40, 148],
    [100, 132],
    [160, 138],
    [220, 108],
    [280, 114],
    [340, 86],
    [400, 92],
    [460, 66],
    [520, 72],
    [560, 48],
  ];

  return (
    <div className="login-market-chart" aria-hidden="true">
      <div className="login-market-chart__glow" />
      <svg viewBox="0 0 600 200" className="login-market-chart__svg" fill="none" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="login-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.42)" />
            <stop offset="55%" stopColor="rgba(34,211,238,0.14)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
        </defs>
        {[40, 100, 160, 220, 280, 340, 400, 460, 520, 560].map((x) => (
          <line key={`v-${x}`} x1={x} y1="28" x2={x} y2="172" stroke="rgba(148,163,184,0.11)" strokeWidth="1" />
        ))}
        {[52, 82, 112, 142].map((y) => (
          <line key={`h-${y}`} x1="24" y1={y} x2="576" y2={y} stroke="rgba(148,163,184,0.07)" strokeWidth="1" />
        ))}
        <path
          d="M24 154 L40 148 L100 132 L160 138 L220 108 L280 114 L340 86 L400 92 L460 66 L520 72 L560 48 L560 172 L24 172 Z"
          fill="url(#login-chart-fill)"
        />
        <path
          className="login-market-chart__line"
          d="M24 154 L40 148 L100 132 L160 138 L220 108 L280 114 L340 86 L400 92 L460 66 L520 72 L560 48"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {chartPoints.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} className="login-market-chart__dot" cx={cx} cy={cy} r="4" />
        ))}
        <circle className="login-market-chart__dot login-market-chart__dot--endpoint" cx="560" cy="48" r="5.5" />
      </svg>
    </div>
  );
}

function FeatureCard({ icon: Icon, titleAr, labelEn, description }) {
  return (
    <article className="login-feature-card group">
      <div className="login-feature-card__icon mb-2 flex h-9 w-9 items-center justify-center rounded-xl transition md:mb-3 md:h-10 md:w-10 md:rounded-2xl">
        <Icon className="h-4 w-4 md:h-5 md:w-5" />
      </div>
      <h3 className="login-feature-card__title text-xs md:text-sm">{titleAr}</h3>
      <p className="login-feature-card__label-en mt-0.5 text-[9px] uppercase md:text-[10px]">{labelEn}</p>
      <p className="login-feature-card__desc mt-1 text-[11px] leading-relaxed md:text-xs">{description}</p>
    </article>
  );
}

function MarketRegion() {
  return (
    <section className="login-market-region" aria-label="تجربة السوق">
      <div className="login-market-region__glow" aria-hidden="true" />
      <div className="login-market-region__inner">
        <div className="login-market-region__header">
          <div className="login-market-region__brand">
            <div className="login-market-region__brand-row">
              <BrandMark size="sm" className="login-market-brand-mark" />
              <p className="login-market-region__brand-name text-base md:text-lg">HasaN CharT World</p>
            </div>
            <p className="login-market-region__brand-tagline text-[11px] md:text-xs">
              Trading Intelligence Platform
            </p>
          </div>
        </div>

        <div className="login-market-region__composition">
          <div className="login-market-region__copy">
            <span className="login-marketing-badge text-[11px] md:text-xs">
              تجربة سوق متكاملة
            </span>
            <h1 className="login-marketing-title max-w-xl text-xl leading-[1.25] tracking-tight md:text-2xl lg:text-[2rem] lg:leading-[1.2]">
              منصة واحدة. رؤية أوضح للسوق.
            </h1>
            <p className="login-marketing-desc max-w-lg text-sm leading-6 md:text-[0.9375rem] md:leading-7">
              الأسعار المباشرة، التحليلات، التنبيهات والأخبار المالية في تجربة واحدة.
            </p>
          </div>

        <div className="login-market-region__chart">
          <MarketChartVisual />
        </div>

        <div className="login-market-region__features">
          <FeatureCard icon={IconTrending} titleAr="الأسواق المباشرة" labelEn="Live Markets" description="تحركات السوق لحظيًا" />
          <FeatureCard icon={IconChart} titleAr="التحليل الذكي" labelEn="Smart Analysis" description="أدوات تحليل متقدمة" />
          <FeatureCard icon={IconBell} titleAr="تنبيهات 24/7" labelEn="Alerts" description="تنبيهات لا تتوقف" />
        </div>
        </div>
      </div>
    </section>
  );
}

function MobileMarketingHero() {
  return (
    <div className="login-mobile-hero md:hidden">
      <span className="login-mobile-hero__accent" aria-hidden="true" />
      <p className="login-mobile-hero__title">منصة واحدة. رؤية أوضح للسوق.</p>
    </div>
  );
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SIGN_IN_TIMEOUT_MS = 10000;
const SIGN_IN_TIMEOUT_MESSAGE = "تعذر الاتصال بخدمة تسجيل الدخول، أعد المحاولة";

function resolvePostLoginDestination({ email, nextPath }) {
  const safeNext = getSafeNextPath(nextPath);

  if (isAdminUser({ email })) {
    if (safeNext && safeNext.startsWith("/admin")) {
      return safeNext;
    }
    return "/admin";
  }

  return safeNext || "/my-dashboard";
}

async function loginWithApi(email, password, { turnstileToken = "", challengeId = "" } = {}, timeoutMs = SIGN_IN_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, turnstileToken, challengeId }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (payload?.code === "TURNSTILE_REQUIRED") {
      const err = new Error(payload.error || "TURNSTILE_REQUIRED");
      err.code = "TURNSTILE_REQUIRED";
      err.challengeId = payload.challengeId;
      throw err;
    }

    if (response.status === 429) {
      const retryAfterHeader = Number(response.headers.get("Retry-After"));
      const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader
        : Number(payload?.retryAfterSeconds) || 60;

      return {
        data: null,
        error: {
          code: payload?.code || "AUTH_RATE_LIMITED",
          message:
            payload?.error ||
            "تم إجراء عدة محاولات تسجيل دخول خلال وقت قصير. حاول مجددًا بعد قليل.",
          retryAfterSeconds,
        },
      };
    }

    if (!response.ok) {
      return {
        data: null,
        error: { message: payload?.error || "بيانات الدخول غير صحيحة" },
      };
    }

    return {
      data: {
        user: payload.user,
        session: payload.session,
      },
      error: null,
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("SIGN_IN_TIMEOUT");
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

const verifyTurnstileToken = async (token) => {
  if (!TURNSTILE_SITE_KEY) return { ok: true };

  if (!token) {
    return { ok: false, error: "يرجى تأكيد أنك لست روبوت قبل تسجيل الدخول" };
  }

  try {
    const response = await fetch("/api/verify-turnstile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      return {
        ok: false,
        error: result?.error || "فشل التحقق الأمني. جرّب مرة ثانية.",
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return {
      ok: false,
      error: "تعذر التحقق الأمني. تحقق من الاتصال ثم جرّب مرة ثانية.",
    };
  }
};

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || searchParams.get("redirect");
  const { showAppModal } = useAppModal();
  const { authResolved, user, acknowledgeSignIn, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [loginChallengeId, setLoginChallengeId] = useState("");
  const turnstileWidgetId = useRef(null);

  useEffect(() => {
    if (!authResolved || status === "loading" || !user?.email) return;

    router.replace(resolvePostLoginDestination({ email: user.email, nextPath }));
  }, [authResolved, status, user, router, nextPath]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRequired) return;

    const existingScript = document.querySelector("script[data-turnstile]");

    const renderTurnstile = () => {
      if (!window.turnstile || !document.getElementById("turnstile-login")) return;

      document.getElementById("turnstile-login").innerHTML = "";

      turnstileWidgetId.current = window.turnstile.render("#turnstile-login", {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        language: "ar",
        appearance: "always",
        size: "normal",
        callback: (token) => {
          setTurnstileToken(token || "");
        },
        "expired-callback": () => {
          setTurnstileToken("");
        },
        "error-callback": () => {
          setTurnstileToken("");
        },
      });

      setTurnstileReady(true);
    };

    if (existingScript) {
      renderTurnstile();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    script.onload = renderTurnstile;
    document.body.appendChild(script);
  }, [turnstileRequired]);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setFormError("اكتب البريد الإلكتروني وكلمة المرور");
      return;
    }

    if (turnstileRequired && TURNSTILE_SITE_KEY && !turnstileToken) {
      setFormError("يرجى تأكيد أنك لست روبوت قبل تسجيل الدخول");
      return;
    }

    setFormError("");
    setLoading(true);

    try {
      devLog("[LOGIN] before login API", { email: "[redacted]" });

      const { data, error } = await loginWithApi(cleanEmail, password, {
        turnstileToken: turnstileRequired ? turnstileToken : "",
        challengeId: turnstileRequired ? loginChallengeId : "",
      });

      devLog("[LOGIN] after login API", {
        ok: !error && Boolean(data?.session),
        error: error?.message || null,
      });

      if (error || !data?.session || !data?.user?.email) {
        const rateLimitMessage =
          error?.code === "AUTH_RATE_LIMITED" && error?.retryAfterSeconds
            ? `${error.message} يمكنك المحاولة مجددًا بعد ${error.retryAfterSeconds} ثانية.`
            : error?.message || "بيانات الدخول غير صحيحة";

        setFormError(rateLimitMessage);
        setTurnstileToken("");
        if (window.turnstile && turnstileWidgetId.current !== null) {
          window.turnstile.reset(turnstileWidgetId.current);
        }
        return;
      }

      const destination = resolvePostLoginDestination({
        email: data.user.email,
        nextPath,
      });

      const applied = await applyClientSession(data.session);

      if (!applied.ok || !applied.user) {
        setFormError("تعذر تفعيل الجلسة بعد تسجيل الدخول. جرّب مرة ثانية.");
        setTurnstileToken("");
        if (window.turnstile && turnstileWidgetId.current !== null) {
          window.turnstile.reset(turnstileWidgetId.current);
        }
        return;
      }

      acknowledgeSignIn(applied.user);

      router.refresh();
      router.replace(destination);
    } catch (err) {
      if (err?.code === "TURNSTILE_REQUIRED") {
        setTurnstileRequired(true);
        setLoginChallengeId(err.challengeId || "");
        setTurnstileToken("");
        if (window.turnstile && turnstileWidgetId.current !== null) {
          window.turnstile.reset(turnstileWidgetId.current);
        }
        setFormError("لأسباب أمنية، أكمل التحقق ثم حاول تسجيل الدخول مرة أخرى.");
        return;
      }
      devLog("[LOGIN] catch", err?.message || err);

      if (err?.message === "SIGN_IN_TIMEOUT") {
        setFormError(SIGN_IN_TIMEOUT_MESSAGE);
        return;
      }

      console.error("Login error:", err);
      setFormError("حدث خطأ أثناء تسجيل الدخول. جرّب مرة ثانية.");
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId.current !== null) {
        window.turnstile.reset(turnstileWidgetId.current);
      }
    } finally {
      devLog("[LOGIN] finally");
      setLoading(false);
    }
  };

  const sendResetPassword = async () => {
    const cleanEmail = (resetEmail || email).trim().toLowerCase();

    if (!cleanEmail) {
      showAppModal({
        type: "warning",
        title: "بيانات ناقصة",
        message: "اكتب البريد الإلكتروني أولاً",
      });
      return;
    }

    setResetLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          redirectTo: `${window.location.origin}/login`,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        showAppModal({
          type: "error",
          title: "تعذر إرسال الرابط",
          message: payload?.error || "حدث خطأ أثناء إرسال رابط تغيير كلمة المرور",
        });
        return;
      }

      showAppModal({
        type: "success",
        title: "تم إرسال الرابط",
        message: "تم إرسال رابط تغيير كلمة المرور إلى بريدك الإلكتروني",
      });
    } catch {
      showAppModal({
        type: "error",
        title: "تعذر إرسال الرابط",
        message: "حدث خطأ أثناء إرسال رابط تغيير كلمة المرور",
      });
    } finally {
      setResetLoading(false);
    }
  };

  if (authResolved && status === "authenticated" && user?.email) {
    return (
      <main className="admin-access-loading admin-access-loading--calm">
        <div className="admin-access-loading__panel">
          <div className="admin-access-loading__icon" aria-hidden="true">
            ⏳
          </div>
          <h1 className="admin-access-loading__title">جاري تحويلك...</h1>
          <p className="admin-access-loading__desc">تم التحقق من الجلسة، سيتم إعادتك إلى وجهتك.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <AmbientBackground />

      <div className="login-shell-wrap">
        <div className="login-shell">
          <MarketRegion />

          <section className="login-auth-region" aria-label="تسجيل الدخول">
            <div className="login-auth-region__inner">
              <MobileMarketingHero />

              <div className="login-auth-region__header">
                <div className="login-auth-brand-wrap mx-auto mb-3 flex justify-center md:mb-4">
                  <BrandMark size="sm" />
                </div>
                <h2 className="login-auth-title text-xl font-black tracking-tight text-slate-900 md:text-2xl">مرحبًا بعودتك</h2>
                <p className="login-auth-desc mt-2 text-sm leading-relaxed text-slate-600 md:text-base">
                  سجّل دخولك للوصول إلى حسابك وأدواتك في{" "}
                  <span className="login-brand-phrase">HasaN CharT World</span>
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-3.5 md:space-y-4" noValidate>
                {formError ? (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    {formError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label htmlFor="login-email" className="block text-sm font-bold text-slate-800">
                    البريد الإلكتروني
                  </label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    dir="ltr"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setResetEmail(e.target.value);
                      if (formError) setFormError("");
                    }}
                    required
                    className="login-input w-full rounded-2xl px-4 py-3.5 text-start text-slate-900 outline-none placeholder:text-slate-400 md:px-5 md:py-4"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="login-password" className="block text-sm font-bold text-slate-800">
                    كلمة المرور
                  </label>
                  <div className="login-password-field">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      dir="ltr"
                      placeholder="أدخل كلمة المرور"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (formError) setFormError("");
                      }}
                      required
                      className="login-input login-password-input w-full rounded-2xl py-3.5 text-slate-900 outline-none placeholder:text-slate-400 md:py-4"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                      className="login-password-toggle"
                    >
                      {showPassword ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {TURNSTILE_SITE_KEY && turnstileRequired && (
                  <div className="rounded-2xl border border-cyan-200/60 bg-cyan-50/50 p-4">
                    <div className="mb-3 text-center text-sm font-bold text-cyan-800">
                      تحقق أمني لحماية الحساب
                    </div>
                    <div id="turnstile-login" className="flex min-h-[70px] justify-center overflow-hidden rounded-xl" />
                    {!turnstileReady && (
                      <p className="mt-2 text-center text-xs font-medium text-slate-500">
                        جاري تحميل حماية تسجيل الدخول...
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    onClick={sendResetPassword}
                    disabled={resetLoading}
                    className="font-bold text-cyan-700 transition hover:text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:opacity-60"
                  >
                    {resetLoading ? "جاري إرسال الرابط..." : "نسيت كلمة المرور؟"}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="login-submit-btn group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-6 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-65 md:py-4"
                >
                  {loading ? (
                    <>
                      <LoginSpinner className="h-5 w-5" />
                      <span>جارٍ تسجيل الدخول…</span>
                    </>
                  ) : (
                    <span>تسجيل الدخول</span>
                  )}
                </button>

                <p className="text-center text-sm text-slate-600">
                  ليس لديك حساب؟{" "}
                  <Link
                    href="/register"
                    className="font-bold text-blue-600 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                  >
                    إنشاء حساب
                  </Link>
                </p>

                <p className="login-trust-line" role="note">
                  <IconLock className="login-trust-line__icon shrink-0" aria-hidden="true" />
                  <span>تسجيل دخول آمن • حماية الجلسة • خصوصية الحساب</span>
                </p>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
