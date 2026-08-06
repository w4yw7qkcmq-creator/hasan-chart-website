"use client";

import "../../components/admin-access-loading.css";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { devLog } from "../../../lib/dev-log";
import { isAdminUser } from "../../../lib/admin-emails";
import { applyClientSession } from "../../../lib/auth-session-client";
import { useAppModal } from "../../components/AppModalProvider";
import { useAuth } from "../../components/AuthProvider";

function BrandMark({ size = "lg" }) {
  const box = size === "sm" ? "h-16 w-16" : "h-24 w-24";
  const textSize = size === "sm" ? "text-lg" : "text-2xl";

  return (
    <div className={`${box} relative grid place-items-center overflow-hidden rounded-[28px] border border-cyan-300/30 bg-gradient-to-br from-[#0b63ff]/35 via-[#00a3ff]/15 to-[#020617] shadow-[0_0_50px_rgba(0,163,255,0.35)]`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(125,211,252,0.45),transparent_35%)]" />
      <div className="absolute bottom-0 left-0 h-1/2 w-full bg-gradient-to-t from-cyan-400/15 to-transparent" />
      <div className="relative z-10 flex flex-col items-center leading-none">
        <div className="relative mb-1 h-8 w-12">
          <span className="absolute bottom-0 right-0 h-4 w-2 rounded bg-cyan-300" />
          <span className="absolute bottom-0 right-4 h-6 w-2 rounded bg-blue-400" />
          <span className="absolute bottom-0 right-8 h-8 w-2 rounded bg-white" />
          <svg viewBox="0 0 80 50" className="absolute -top-1 right-0 h-10 w-14" fill="none">
            <path d="M6 38 L26 24 L40 31 L68 8" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M55 7 H69 V21" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className={`${textSize} font-black tracking-tight text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]`}>HC</span>
      </div>
    </div>
  );
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SIGN_IN_TIMEOUT_MS = 10000;
const SIGN_IN_TIMEOUT_MESSAGE = "تعذر الاتصال بخدمة تسجيل الدخول، أعد المحاولة";

function getSafeNextPath(next) {
  if (typeof next !== "string") return null;

  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  return trimmed;
}

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

async function loginWithApi(email, password, timeoutMs = SIGN_IN_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

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
  const [resetEmail, setResetEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileWidgetId = useRef(null);

  useEffect(() => {
    if (!authResolved || status === "loading" || !user?.email) return;

    router.replace(resolvePostLoginDestination({ email: user.email, nextPath }));
  }, [authResolved, status, user, router, nextPath]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

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
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      showAppModal({
        type: "warning",
        title: "بيانات ناقصة",
        message: "اكتب البريد الإلكتروني وكلمة المرور",
      });
      return;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      showAppModal({
        type: "warning",
        title: "تحقق أمني مطلوب",
        message: "يرجى تأكيد أنك لست روبوت قبل تسجيل الدخول",
      });
      return;
    }

    setLoading(true);

    try {
      const captchaCheck = await verifyTurnstileToken(turnstileToken);

      if (!captchaCheck.ok) {
        showAppModal({
          type: "error",
          title: "فشل التحقق الأمني",
          message: captchaCheck.error,
        });
        setTurnstileToken("");
        if (window.turnstile && turnstileWidgetId.current !== null) {
          window.turnstile.reset(turnstileWidgetId.current);
        }
        return;
      }

      devLog("[LOGIN] before login API", { email: "[redacted]" });

      const { data, error } = await loginWithApi(cleanEmail, password);

      devLog("[LOGIN] after login API", {
        ok: !error && Boolean(data?.session),
        error: error?.message || null,
      });

      if (error || !data?.session || !data?.user?.email) {
        showAppModal({
          type: "error",
          title: "فشل تسجيل الدخول",
          message: error?.message || "بيانات الدخول غير صحيحة",
        });
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
        showAppModal({
          type: "error",
          title: "فشل تسجيل الدخول",
          message: "تعذر تفعيل الجلسة بعد تسجيل الدخول. جرّب مرة ثانية.",
        });
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
      devLog("[LOGIN] catch", err?.message || err);

      if (err?.message === "SIGN_IN_TIMEOUT") {
        showAppModal({
          type: "error",
          title: "تعذر تسجيل الدخول",
          message: SIGN_IN_TIMEOUT_MESSAGE,
        });
        return;
      }

      console.error("Login error:", err);
      showAppModal({
        type: "error",
        title: "فشل تسجيل الدخول",
        message: "حدث خطأ أثناء تسجيل الدخول. جرّب مرة ثانية.",
      });
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
    <main className="min-h-screen w-full overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(0,102,255,0.42),transparent_30%),radial-gradient(circle_at_85%_25%,rgba(34,211,238,0.18),transparent_28%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.18] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 grid min-h-screen grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5 p-4 md:p-6">
        <section className="order-2 xl:order-1 flex items-center justify-center rounded-[36px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/80 via-[#040b1c]/90 to-[#020617]/95 p-6 md:p-10 shadow-2xl backdrop-blur-2xl">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex justify-center">
                <BrandMark />
              </div>
              <h1 className="text-4xl font-black tracking-tight">مرحباً بعودتك</h1>
              <p className="mt-3 text-slate-400">ادخل إلى منصة HasaN CharT World لإدارة تحليلاتك وتنبيهاتك</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-300">البريد الإلكتروني</label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setResetEmail(e.target.value);
                  }}
                  required
                  className="w-full rounded-2xl border border-blue-300/15 bg-black/35 px-5 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-400/10"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-300">كلمة المرور</label>
                <input
                  type="password"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-blue-300/15 bg-black/35 px-5 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-400/10"
                />
              </div>

              {TURNSTILE_SITE_KEY && (
                <div className="rounded-2xl border border-cyan-300/15 bg-black/25 p-4 shadow-[0_0_25px_rgba(34,211,238,0.08)]">
                  <div className="mb-3 text-center text-sm font-bold text-cyan-200">
                    تحقق أمني لحماية الحساب
                  </div>
                  <div id="turnstile-login" className="flex min-h-[70px] justify-center overflow-hidden rounded-xl" />
                  {!turnstileReady && (
                    <p className="mt-2 text-center text-xs font-bold text-slate-400">
                      جاري تحميل حماية تسجيل الدخول...
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 text-sm">
                <button type="button" onClick={sendResetPassword} disabled={resetLoading} className="font-bold text-cyan-300 underline disabled:opacity-60">
                  {resetLoading ? "جاري إرسال الرابط..." : "نسيت كلمة المرور؟"}
                </button>
                <a href="/register" className="font-bold text-blue-300 underline">
                  إنشاء حساب
                </a>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.38)] transition hover:scale-[1.01] disabled:opacity-60"
              >
                <span className="absolute inset-0 translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition group-hover:translate-x-[-120%]" />
                <span className="relative">{loading ? "جاري التحقق والدخول..." : "تسجيل الدخول"}</span>
              </button>
            </form>
          </div>
        </section>

        <section className="order-1 xl:order-2 relative hidden xl:flex overflow-hidden rounded-[36px] border border-cyan-300/20 bg-gradient-to-br from-[#0b63ff]/20 via-[#07142f]/95 to-[#020617]/95 p-10 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(37,99,235,0.42),transparent_34%),radial-gradient(circle_at_78%_70%,rgba(34,211,238,0.16),transparent_30%)]" />
          <div className="absolute -left-32 top-20 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-16 right-16 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <BrandMark size="sm" />
                <div>
                  <h2 className="text-3xl font-black">HasaN CharT World</h2>
                  <p className="text-slate-400">Trading Intelligence Platform</p>
                </div>
              </div>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200">
                Live Market Hub
              </span>
            </div>

            <div className="max-w-3xl py-16">
              <span className="inline-flex rounded-full border border-blue-300/20 bg-blue-500/15 px-4 py-2 text-sm font-bold text-blue-200">
                منصة تداول ذكية
              </span>
              <h1 className="mt-7 text-6xl 2xl:text-7xl font-black leading-tight tracking-tight">
                تداول أوضح، بيانات أسرع، وتحليلات أدق.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-9 text-slate-300">
                تجربة احترافية تجمع الأسعار المباشرة، الشارت الحي، طلبات التحليل، والتنبيهات السعرية داخل لوحة واحدة متناسقة.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                <strong className="block text-3xl text-cyan-300">24/7</strong>
                <span className="text-sm text-slate-400">متابعة الأسواق</span>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                <strong className="block text-3xl text-cyan-300">Live</strong>
                <span className="text-sm text-slate-400">أسعار مباشرة</span>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                <strong className="block text-xl text-cyan-300 leading-7">فريق مكون من 6 محللين محترفين</strong>
                <span className="text-sm text-slate-400">تحليل منظم</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}