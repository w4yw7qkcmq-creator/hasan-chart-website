"use client";
import { UiPageShell } from "../../components/ui";
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
    <div
      className={`${box} relative grid place-items-center overflow-hidden rounded-[28px] border admin-panel-border admin-panel shadow-[0_0_50px_rgba(0,163,255,0.35)]`}
    >
      {" "}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(125,211,252,0.45),transparent_35%)]" />{" "}
      <div className="absolute bottom-0 left-0 h-1/2 w-full admin-panel" />{" "}
      <div className="relative z-10 flex flex-col items-center leading-none">
        {" "}
        <div className="relative mb-1 h-8 w-12">
          {" "}
          <span className="absolute bottom-0 right-0 h-4 w-2 rounded admin-panel" />{" "}
          <span className="ui-login-caret" aria-hidden="true" />
          <span className="absolute bottom-0 right-8 h-8 w-2 rounded ui-glass-solid" />{" "}
          <svg
            viewBox="0 0 80 50"
            className="absolute -top-1 right-0 h-10 w-14"
            fill="none"
          >
            {" "}
            <path
              d="M6 38 L26 24 L40 31 L68 8"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />{" "}
            <path
              d="M55 7 H69 V21"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />{" "}
          </svg>{" "}
        </div>{" "}
        <span
          className={`${textSize} font-black tracking-tight admin-text drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]`}
        >
          HC
        </span>{" "}
      </div>{" "}
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
      data: { user: payload.user, session: payload.session },
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
      headers: { "Content-Type": "application/json" },
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
    router.replace(
      resolvePostLoginDestination({ email: user.email, nextPath }),
    );
  }, [authResolved, status, user, router, nextPath]);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const existingScript = document.querySelector("script[data-turnstile]");
    const renderTurnstile = () => {
      if (!window.turnstile || !document.getElementById("turnstile-login"))
        return;
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
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
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
          message:
            payload?.error || "حدث خطأ أثناء إرسال رابط تغيير كلمة المرور",
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
        {" "}
        <div className="admin-access-loading__panel">
          {" "}
          <div className="admin-access-loading__icon" aria-hidden="true">
            {" "}
            ⏳{" "}
          </div>{" "}
          <h1 className="admin-access-loading__title">جاري تحويلك...</h1>{" "}
          <p className="admin-access-loading__desc">
            تم التحقق من الجلسة، سيتم إعادتك إلى وجهتك.
          </p>{" "}
        </div>{" "}
      </main>
    );
  }
  return (
    <main className="min-h-screen w-full overflow-hidden ui-page-dark admin-text">
      {" "}
      <div className="ui-public-seo-page__backdrop pointer-events-none fixed inset-0" />{" "}
      <div className="pointer-events-none fixed inset-0 opacity-[0.18] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />{" "}
      <div className="relative z-10 grid min-h-screen grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5 p-4 md:p-6">
        {" "}
        <section className="order-2 xl:order-1 flex items-center justify-center ui-public-seo-hero p-6 md:p-10">
          {" "}
          <div className="w-full max-w-md">
            {" "}
            <div className="mb-8 text-center">
              {" "}
              <div className="mx-auto mb-5 flex justify-center">
                {" "}
                <BrandMark />{" "}
              </div>{" "}
              <h1 className="text-4xl font-black tracking-tight">
                مرحباً بعودتك
              </h1>{" "}
              <p className="ui-public-seo-subtitle mt-3">
                ادخل إلى منصة HasaN CharT World لإدارة تحليلاتك وتنبيهاتك
              </p>{" "}
            </div>{" "}
            <form onSubmit={handleLogin} className="space-y-5">
              {" "}
              <div className="space-y-2">
                {" "}
                <label className="block text-sm font-bold admin-text-muted">
                  البريد الإلكتروني
                </label>{" "}
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setResetEmail(e.target.value);
                  }}
                  required
                  className="ui-auth-field"
                />{" "}
              </div>{" "}
              <div className="space-y-2">
                {" "}
                <label className="block text-sm font-bold admin-text-muted">
                  كلمة المرور
                </label>{" "}
                <input
                  type="password"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="ui-auth-field"
                />{" "}
              </div>{" "}
              {TURNSTILE_SITE_KEY && (
                <div className="rounded-2xl border admin-panel-border admin-panel p-4 shadow-[0_0_25px_rgba(34,211,238,0.08)]">
                  {" "}
                  <div className="mb-3 text-center text-sm font-bold admin-text-muted">
                    {" "}
                    تحقق أمني لحماية الحساب{" "}
                  </div>{" "}
                  <div
                    id="turnstile-login"
                    className="flex min-h-[70px] justify-center overflow-hidden rounded-xl"
                  />{" "}
                  {!turnstileReady && (
                    <p className="mt-2 text-center text-xs font-bold admin-text-subtle">
                      {" "}
                      جاري تحميل حماية تسجيل الدخول...{" "}
                    </p>
                  )}{" "}
                </div>
              )}{" "}
              <div className="flex items-center justify-between gap-3 text-sm">
                {" "}
                <button
                  type="button"
                  onClick={sendResetPassword}
                  disabled={resetLoading}
                  className="font-bold admin-text-muted underline disabled:opacity-60"
                >
                  {" "}
                  {resetLoading
                    ? "جاري إرسال الرابط..."
                    : "نسيت كلمة المرور؟"}{" "}
                </button>{" "}
                <a
                  href="/register"
                  className="font-bold ui-text-muted underline"
                >
                  {" "}
                  إنشاء حساب{" "}
                </a>{" "}
              </div>{" "}
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-2xl admin-panel px-6 py-4 font-black admin-text shadow-[0_18px_50px_rgba(37,99,235,0.38)] transition hover:scale-[1.01] disabled:opacity-60"
              >
                {" "}
                <span className="absolute inset-0 translate-x-full admin-panel transition group-hover:translate-x-[-120%]" />{" "}
                <span className="relative">
                  {loading ? "جاري التحقق والدخول..." : "تسجيل الدخول"}
                </span>{" "}
              </button>{" "}
            </form>{" "}
          </div>{" "}
        </section>{" "}
        <section className="order-1 xl:order-2 relative hidden xl:flex overflow-hidden ui-public-seo-hero admin-panel-border p-10">
          {" "}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(37,99,235,0.42),transparent_34%),radial-gradient(circle_at_78%_70%,rgba(34,211,238,0.16),transparent_30%)]" />{" "}
          <div className="ui-public-seo-hero-glow ui-public-seo-hero-glow--primary ui-public-seo-hero-glow--left-auth" />
          <div className="absolute bottom-16 right-16 h-96 w-96 rounded-full admin-panel blur-3xl" />{" "}
          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            {" "}
            <div className="flex items-center justify-between gap-4">
              {" "}
              <div className="flex items-center gap-4">
                {" "}
                <BrandMark size="sm" />{" "}
                <div>
                  {" "}
                  <h2 className="text-3xl font-black">
                    HasaN CharT World
                  </h2>{" "}
                  <p className="admin-text-subtle">
                    Trading Intelligence Platform
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <span className="rounded-full border admin-panel-border admin-panel px-4 py-2 text-sm font-bold admin-text-muted">
                {" "}
                Live Market Hub{" "}
              </span>{" "}
            </div>{" "}
            <div className="max-w-3xl py-16">
              {" "}
              <span className="inline-flex rounded-full border admin-panel-border admin-panel px-4 py-2 text-sm font-bold admin-text-muted">
                {" "}
                منصة تداول ذكية{" "}
              </span>{" "}
              <h1 className="mt-7 text-6xl 2xl:text-7xl font-black leading-tight tracking-tight">
                {" "}
                تداول أوضح، بيانات أسرع، وتحليلات أدق.{" "}
              </h1>{" "}
              <p className="mt-7 max-w-2xl text-lg leading-9 admin-text-muted">
                {" "}
                تجربة احترافية تجمع الأسعار المباشرة، الشارت الحي، طلبات
                التحليل، والتنبيهات السعرية داخل لوحة واحدة متناسقة.{" "}
              </p>{" "}
            </div>{" "}
            <div className="grid grid-cols-3 gap-4">
              {" "}
              <div className="rounded-3xl border admin-panel-border ui-glass-5 p-5 backdrop-blur-xl">
                {" "}
                <strong className="block text-3xl admin-text-muted">
                  24/7
                </strong>{" "}
                <span className="text-sm admin-text-subtle">
                  متابعة الأسواق
                </span>{" "}
              </div>{" "}
              <div className="rounded-3xl border admin-panel-border ui-glass-5 p-5 backdrop-blur-xl">
                {" "}
                <strong className="block text-3xl admin-text-muted">
                  Live
                </strong>{" "}
                <span className="text-sm admin-text-subtle">
                  أسعار مباشرة
                </span>{" "}
              </div>{" "}
              <div className="rounded-3xl border admin-panel-border ui-glass-5 p-5 backdrop-blur-xl">
                {" "}
                <strong className="block text-xl admin-text-muted leading-7">
                  فريق مكون من 6 محللين محترفين
                </strong>{" "}
                <span className="text-sm admin-text-subtle">
                  تحليل منظم
                </span>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}
