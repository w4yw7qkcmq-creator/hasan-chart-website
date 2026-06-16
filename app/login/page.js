"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

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

const FALLBACK_ADMIN_EMAILS = [
  "alerts@hasanchartworld.com",
  "admin@hasanchartworld.com",
  "hasanchartworld@gmail.com",
  "ahmaagahmaadd@gmail.com",
];

const SUPABASE_AUTH_URL = "https://lzgsxdsumnteuwtjfqlm.supabase.co/auth/v1/token?grant_type=password";
const SUPABASE_PUBLIC_KEY = "sb_publishable_XCZkQPsJymbmnNuBR9fMpw_SVEFwZm0";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const loginDirectlyWithSupabase = async (email, password) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(SUPABASE_AUTH_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        user: null,
        error: result?.error_description || result?.msg || result?.error || "بيانات الدخول غير صحيحة",
      };
    }

    return {
      user: result?.user || null,
      session: result || null,
      error: null,
    };
  } catch (err) {
    return {
      user: null,
      error:
        err?.name === "AbortError"
          ? "الاتصال أخذ وقت طويل. جرّب مرة ثانية أو افتح الموقع من نافذة خاصة."
          : "تعذر الاتصال بخدمة تسجيل الدخول",
    };
  } finally {
    clearTimeout(timeout);
  }
};

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileWidgetId = useRef(null);

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem("currentUser") || "null");

    if (!savedUser?.email) return;

    const savedEmail = String(savedUser.email || "").toLowerCase();
    const savedRole = savedUser.role === "admin" || FALLBACK_ADMIN_EMAILS.includes(savedEmail) ? "admin" : "user";

    if (savedRole === "admin" && savedUser.role !== "admin") {
      const upgradedUser = { ...savedUser, role: "admin" };
      localStorage.setItem("currentUser", JSON.stringify(upgradedUser));
      sessionStorage.setItem("currentUser", JSON.stringify(upgradedUser));
    }

    setTimeout(() => {
      window.location.href = savedRole === "admin"
        ? "/admin"
        : "/my-dashboard";
    }, 150);
  }, [router]);

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

  const login = async (e) => {
    e.preventDefault();

    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      alert("اكتب البريد الإلكتروني وكلمة المرور");
      return;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      alert("يرجى تأكيد أنك لست روبوت قبل تسجيل الدخول");
      return;
    }

    setLoading(true);

    const captchaCheck = await verifyTurnstileToken(turnstileToken);

    if (!captchaCheck.ok) {
      alert(captchaCheck.error);
      setLoading(false);
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId.current !== null) {
        window.turnstile.reset(turnstileWidgetId.current);
      }
      return;
    }

    localStorage.removeItem("currentUser");
    sessionStorage.removeItem("currentUser");
    localStorage.removeItem("hasan-chart-auth-session");
    localStorage.removeItem("sb-lzgsxdsumnteuwtjfqlm-auth-token");
    localStorage.removeItem("supabase.auth.token");
    sessionStorage.removeItem("hasan-chart-auth-session");
    sessionStorage.removeItem("sb-lzgsxdsumnteuwtjfqlm-auth-token");
    sessionStorage.removeItem("supabase.auth.token");

    try {
      const { user, session, error } = await loginDirectlyWithSupabase(cleanEmail, password);

      if (error || !user) {
        alert(error || "بيانات الدخول غير صحيحة");
        setLoading(false);
        setTurnstileToken("");
        if (window.turnstile && turnstileWidgetId.current !== null) {
          window.turnstile.reset(turnstileWidgetId.current);
        }
        return;
      }

      const role = FALLBACK_ADMIN_EMAILS.includes(cleanEmail) ? "admin" : "user";

      const userData = {
        id: user.id,
        email: user.email,
        username: user.user_metadata?.username || user.email?.split("@")[0] || "مستخدم",
        telegram: user.user_metadata?.telegram || "",
        role,
        subscription_plan: "بدون اشتراك",
        subscription_status: "غير نشط",
        loggedAt: new Date().toLocaleString("ar"),
      };

      localStorage.setItem("currentUser", JSON.stringify(userData));
      sessionStorage.setItem("currentUser", JSON.stringify(userData));

      if (session?.access_token && session?.refresh_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });

        if (setSessionError) {
          console.error("Supabase setSession error:", setSessionError.message);
        }

        localStorage.setItem("hasan-chart-auth-session", JSON.stringify(session));
        localStorage.setItem(
          "sb-lzgsxdsumnteuwtjfqlm-auth-token",
          JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            user: session.user,
          })
        );
      }

      window.dispatchEvent(new Event("storage"));
      window.location.href = role === "admin" ? "/admin" : "/my-dashboard";
    } catch (err) {
      console.error("Login error:", err);
      alert("حدث خطأ أثناء تسجيل الدخول. جرّب مرة ثانية.");
      setLoading(false);
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId.current !== null) {
        window.turnstile.reset(turnstileWidgetId.current);
      }
    }
  };

  const sendResetPassword = async () => {
    const cleanEmail = (resetEmail || email).trim().toLowerCase();

    if (!cleanEmail) {
      alert("اكتب البريد الإلكتروني أولاً");
      return;
    }

    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin + "/login",
    });

    setResetLoading(false);

    if (error) {
      alert("حدث خطأ أثناء إرسال رابط تغيير كلمة المرور");
      return;
    }

    alert("تم إرسال رابط تغيير كلمة المرور إلى بريدك الإلكتروني");
  };

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

            <form onSubmit={login} className="space-y-5">
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