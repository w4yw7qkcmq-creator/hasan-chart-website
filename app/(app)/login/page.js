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

function BrandMark({ size = "lg" }) {
  const box = size === "sm" ? "h-14 w-14 rounded-[22px]" : "h-20 w-20 rounded-[26px]";
  const textSize = size === "sm" ? "text-base" : "text-xl";

  return (
    <div
      className={`${box} relative grid place-items-center overflow-hidden border border-cyan-300/25 bg-gradient-to-br from-[#0b63ff]/40 via-[#00a3ff]/20 to-[#020617] shadow-[0_0_40px_rgba(0,163,255,0.28)]`}
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

function MarketChartVisual() {
  return (
    <div className="pointer-events-none relative mx-auto w-full max-w-lg" aria-hidden="true">
      <div className="login-market-chart__glow absolute inset-0 rounded-[32px] bg-gradient-to-t from-cyan-400/10 via-blue-500/5 to-transparent blur-2xl" />
      <svg viewBox="0 0 480 160" className="relative w-full text-cyan-300/70" fill="none">
        <defs>
          <linearGradient id="login-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.18)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
        </defs>
        {[40, 80, 120, 160, 200, 240, 280, 320, 360, 400, 440].map((x) => (
          <line key={x} x1={x} y1="20" x2={x} y2="140" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
        ))}
        {[40, 70, 100, 130].map((y) => (
          <line key={y} x1="30" y1={y} x2="450" y2={y} stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
        ))}
        <path
          d="M30 120 L70 108 L110 112 L150 88 L190 92 L230 68 L270 72 L310 48 L350 56 L390 36 L430 42 L450 28"
          fill="url(#login-chart-fill)"
          stroke="none"
        />
        <path
          className="login-market-chart__line"
          d="M30 120 L70 108 L110 112 L150 88 L190 92 L230 68 L270 72 L310 48 L350 56 L390 36 L430 42 L450 28"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="450" cy="28" r="4" fill="rgba(34,211,238,0.85)" />
      </svg>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }) {
  return (
    <article className="login-feature-card group rounded-[22px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md transition duration-200 hover:border-cyan-300/25 hover:bg-white/[0.07] md:p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200 transition group-hover:border-cyan-300/35 group-hover:text-cyan-100">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-bold text-white md:text-base">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400 md:text-sm">{description}</p>
    </article>
  );
}

function MarketingPanel({ compact = false }) {
  if (compact) {
    return (
      <div className="mb-5 rounded-[24px] border border-cyan-300/15 bg-gradient-to-br from-[#0b63ff]/15 via-[#07142f]/80 to-[#020617]/90 px-4 py-4 text-center backdrop-blur-xl md:mb-6 md:px-6">
        <p className="text-sm font-bold text-white md:text-base">منصة واحدة. رؤية أوضح للسوق.</p>
        <p className="mt-1 text-xs text-slate-400 md:text-sm">الأسعار المباشرة، التحليلات، التنبيهات والأخبار المالية في تجربة واحدة.</p>
      </div>
    );
  }

  return (
    <section className="relative flex flex-col overflow-hidden rounded-[32px] border border-cyan-300/15 bg-gradient-to-br from-[#0b63ff]/18 via-[#07142f]/92 to-[#020617]/96 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur-2xl md:p-8 lg:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.35),transparent_38%),radial-gradient(circle_at_80%_75%,rgba(34,211,238,0.12),transparent_32%)]" />
      <div className="pointer-events-none absolute -start-24 top-16 h-64 w-64 rounded-full bg-blue-600/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 end-10 h-72 w-72 rounded-full bg-cyan-400/8 blur-3xl" />

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex items-center gap-3">
          <BrandMark size="sm" />
          <div>
            <p className="text-lg font-black text-white md:text-xl">HasaN CharT World</p>
            <p className="text-xs text-slate-400 md:text-sm">Trading Intelligence Platform</p>
          </div>
        </div>

        <div className="my-8 lg:my-10">
          <span className="inline-flex rounded-full border border-blue-300/20 bg-blue-500/12 px-3 py-1.5 text-xs font-bold text-blue-200 md:text-sm">
            تجربة سوق متكاملة
          </span>
          <h1 className="mt-5 max-w-xl text-2xl font-black leading-tight tracking-tight text-white md:text-3xl lg:text-4xl xl:text-[2.6rem] xl:leading-[1.15]">
            منصة واحدة. رؤية أوضح للسوق.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300 md:text-base md:leading-8">
            الأسعار المباشرة، التحليلات، التنبيهات والأخبار المالية في تجربة واحدة.
          </p>
        </div>

        <div className="mb-8 lg:mb-10">
          <MarketChartVisual />
        </div>

        <div className="mt-auto grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <FeatureCard icon={IconTrending} title="Live Markets" description="تحركات السوق لحظيًا" />
          <FeatureCard icon={IconChart} title="Smart Analysis" description="أدوات تحليل متقدمة" />
          <FeatureCard icon={IconBell} title="24/7 Alerts" description="تنبيهات لا تتوقف" />
        </div>
      </div>
    </section>
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

export default function LoginPage() {
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
    <main className="min-h-screen w-full overflow-x-hidden bg-[#020617] text-slate-900">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_8%,rgba(0,102,255,0.38),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.14),transparent_28%),linear-gradient(145deg,#020617,#07142f_50%,#030712)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.14] bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:72px_72px]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1280px] items-center px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-6 xl:gap-8">
          {/* Marketing — desktop left, hidden on mobile */}
          <div className="hidden lg:block">
            <MarketingPanel />
          </div>

          {/* Login panel — first on mobile */}
          <section className="login-card-hover order-first flex items-center justify-center rounded-[32px] border border-white/20 bg-white/[0.97] p-5 shadow-[0_28px_80px_rgba(2,6,23,0.35)] backdrop-blur-xl transition duration-200 md:p-7 lg:p-8">
            <div className="w-full max-w-md">
              {/* Mobile compact marketing */}
              <div className="lg:hidden">
                <MarketingPanel compact />
              </div>

              <div className="mb-6 text-center lg:mb-8">
                <div className="mx-auto mb-4 flex justify-center lg:mb-5">
                  <BrandMark size="sm" />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">مرحبًا بعودتك</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 md:text-base">
                  سجّل دخولك للوصول إلى حسابك وأدواتك في HasaN CharT World
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4 md:space-y-5" noValidate>
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
                  <label htmlFor="login-email" className="block text-sm font-bold text-slate-700">
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
                    className="login-input w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-start text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/15 md:px-5 md:py-4"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="login-password" className="block text-sm font-bold text-slate-700">
                    كلمة المرور
                  </label>
                  <div className="relative">
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
                      className="login-input w-full rounded-2xl border border-slate-200 bg-white py-3.5 pe-12 ps-4 text-start text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/15 md:py-4 md:pe-14 md:ps-5"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                      className="absolute inset-y-0 end-2 flex h-full min-w-[44px] items-center justify-center rounded-xl text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 md:end-3"
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
                  className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-6 py-3.5 font-black text-white shadow-[0_16px_40px_rgba(37,99,235,0.32)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-65 md:py-4"
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

                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <IconLock className="h-3.5 w-3.5 shrink-0" />
                  <span>اتصال آمن</span>
                </p>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
