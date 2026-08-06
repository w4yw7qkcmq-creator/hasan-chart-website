"use client";
import { UiPageShell } from "../../components/ui";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppModal } from "../../components/AppModalProvider";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const verifyTurnstileToken = async (token) => {
  if (!TURNSTILE_SITE_KEY) return { ok: true };
  if (!token) {
    return { ok: false, error: "يرجى تأكيد أنك لست روبوت قبل إنشاء الحساب" };
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
    console.error("Turnstile register verification error:", err);
    return {
      ok: false,
      error: "تعذر التحقق الأمني. تحقق من الاتصال ثم جرّب مرة ثانية.",
    };
  }
};
function RegisterBrandMark() {
  return (
    <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-[28px] border admin-panel-border admin-panel shadow-[0_0_45px_rgba(0,163,255,0.35)]">
      {" "}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(125,211,252,0.45),transparent_35%)]" />{" "}
      <div className="relative z-10 flex flex-col items-center leading-none">
        {" "}
        <svg
          viewBox="0 0 90 60"
          className="h-11 w-14 drop-shadow-[0_0_14px_rgba(34,211,238,0.55)]"
          fill="none"
        >
          {" "}
          <rect
            x="10"
            y="35"
            width="10"
            height="18"
            rx="3"
            fill="var(--ui-chart-series-1)"
          />{" "}
          <rect
            x="30"
            y="25"
            width="10"
            height="28"
            rx="3"
            fill="var(--ui-chart-series-2)"
          />{" "}
          <rect
            x="50"
            y="15"
            width="10"
            height="38"
            rx="3"
            fill="var(--ui-glass-solid)"
          />{" "}
          <path
            d="M9 45 L30 28 L43 35 L72 11"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />{" "}
          <path
            d="M60 10 H74 V24"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />{" "}
        </svg>{" "}
        <span className="ui-public-seo-title text-lg">HC</span>{" "}
      </div>{" "}
    </div>
  );
}
export default function RegisterPage() {
  const router = useRouter();
  const { showAppModal } = useAppModal();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileWidgetId = useRef(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const existingScript = document.querySelector("script[data-turnstile]");
    const renderTurnstile = () => {
      if (!window.turnstile || !document.getElementById("turnstile-register"))
        return;
      document.getElementById("turnstile-register").innerHTML = "";
      turnstileWidgetId.current = window.turnstile.render(
        "#turnstile-register",
        {
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
        },
      );
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
  const resetTurnstile = () => {
    setTurnstileToken("");
    if (window.turnstile && turnstileWidgetId.current !== null) {
      window.turnstile.reset(turnstileWidgetId.current);
    }
  };
  const register = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();
    const cleanTelegram = telegram.trim();
    if (!cleanUsername || !cleanEmail || !password || !confirmPassword) {
      showAppModal({
        type: "warning",
        title: "بيانات ناقصة",
        message: "املأ جميع الحقول المطلوبة",
      });
      return;
    }
    if (password.length < 6) {
      showAppModal({
        type: "warning",
        title: "كلمة مرور ضعيفة",
        message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      });
      return;
    }
    if (password !== confirmPassword) {
      showAppModal({
        type: "warning",
        title: "كلمات المرور غير متطابقة",
        message: "كلمة المرور وتأكيدها غير متطابقين",
      });
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      showAppModal({
        type: "warning",
        title: "تحقق أمني مطلوب",
        message: "يرجى تأكيد أنك لست روبوت قبل إنشاء الحساب",
      });
      return;
    }
    setLoading(true);
    const captchaCheck = await verifyTurnstileToken(turnstileToken);
    if (!captchaCheck.ok) {
      showAppModal({
        type: "error",
        title: "فشل التحقق الأمني",
        message: captchaCheck.error,
      });
      setLoading(false);
      resetTurnstile();
      return;
    }
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          username: cleanUsername,
          telegram: cleanTelegram,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        showAppModal({
          type: "error",
          title: "تعذر إنشاء الحساب",
          message: result?.error || "حدث خطأ أثناء إنشاء الحساب",
        });
        setLoading(false);
        resetTurnstile();
        return;
      }
      showAppModal({
        type: "success",
        title: "تم إنشاء الحساب بنجاح",
        message:
          "أرسلنا رابط تفعيل إلى بريدك الإلكتروني.\nقم بتفعيل الحساب أولاً ثم سجل الدخول.",
      });
      setUsername("");
      setEmail("");
      setTelegram("");
      setPassword("");
      setConfirmPassword("");
      resetTurnstile();
      router.push("/login");
      return;
    } catch (err) {
      showAppModal({
        type: "error",
        title: "تعذر إنشاء الحساب",
        message: "حدث خطأ غير متوقع أثناء إنشاء الحساب",
      });
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="relative min-h-[calc(100vh-90px)] overflow-hidden rounded-[34px] border admin-panel-border ui-page-dark admin-text shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      {" "}
      <div className="ui-public-seo-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="ui-public-seo-page__grid pointer-events-none absolute inset-0 opacity-[0.14]" />{" "}
      <div className="relative z-10 grid min-h-[calc(100vh-90px)] grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-5 p-4 md:p-6">
        {" "}
        <section className="flex items-center justify-center ui-public-seo-hero p-6 md:p-10">
          {" "}
          <div className="w-full max-w-md">
            {" "}
            <div className="mb-7 text-center">
              {" "}
              <div className="mb-5 flex justify-center">
                {" "}
                <RegisterBrandMark />{" "}
              </div>{" "}
              <span className="mb-4 inline-flex rounded-full border admin-panel-border admin-panel px-4 py-2 text-xs font-black admin-text-muted">
                {" "}
                CREATE ACCOUNT{" "}
              </span>{" "}
              <h1 className="text-4xl font-black tracking-tight">
                إنشاء حساب جديد
              </h1>{" "}
              <p className="mt-3 leading-7 admin-text-subtle">
                {" "}
                سجّل الآن للوصول إلى التنبيهات، طلبات التحليل، ولوحة المستخدم
                بتجربة احترافية.{" "}
              </p>{" "}
            </div>{" "}
            <form onSubmit={register} className="space-y-4">
              {" "}
              <label className="block space-y-2">
                {" "}
                <span className="block text-sm font-bold admin-text-muted">
                  اسم المستخدم
                </span>{" "}
                <input
                  placeholder="مثال: Hasan Trader"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="ui-auth-field"
                />{" "}
              </label>{" "}
              <label className="block space-y-2">
                {" "}
                <span className="block text-sm font-bold admin-text-muted">
                  البريد الإلكتروني
                </span>{" "}
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="ui-auth-field"
                />{" "}
              </label>{" "}
              <label className="block space-y-2">
                {" "}
                <span className="block text-sm font-bold admin-text-muted">
                  {" "}
                  يوزر التليجرام{" "}
                  <span className="font-normal admin-text-subtle">
                    (اختياري)
                  </span>{" "}
                </span>{" "}
                <input
                  placeholder="@username"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  className="ui-auth-field"
                />{" "}
              </label>{" "}
              <label className="block space-y-2">
                {" "}
                <span className="block text-sm font-bold admin-text-muted">
                  كلمة المرور
                </span>{" "}
                <div className="relative">
                  {" "}
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="6 أحرف على الأقل"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="ui-auth-field pl-20"
                  />{" "}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold admin-text-muted"
                  >
                    {" "}
                    {showPassword ? "إخفاء" : "إظهار"}{" "}
                  </button>{" "}
                </div>{" "}
              </label>{" "}
              <label className="block space-y-2">
                {" "}
                <span className="block text-sm font-bold admin-text-muted">
                  تأكيد كلمة المرور
                </span>{" "}
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="أعد كتابة كلمة المرور"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="ui-auth-field"
                />{" "}
              </label>{" "}
              {TURNSTILE_SITE_KEY && (
                <div className="rounded-2xl border admin-panel-border admin-panel p-4 shadow-[0_0_25px_rgba(34,211,238,0.08)]">
                  {" "}
                  <div className="mb-3 text-center text-sm font-bold admin-text-muted">
                    {" "}
                    تحقق أمني لحماية الحساب{" "}
                  </div>{" "}
                  <div
                    id="turnstile-register"
                    className="flex min-h-[70px] justify-center overflow-hidden rounded-xl"
                  />{" "}
                  {!turnstileReady && (
                    <p className="mt-2 text-center text-xs font-bold admin-text-subtle">
                      {" "}
                      جاري تحميل حماية إنشاء الحساب...{" "}
                    </p>
                  )}{" "}
                </div>
              )}{" "}
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-2xl admin-panel px-6 py-4 font-black admin-text shadow-[0_18px_50px_rgba(37,99,235,0.38)] transition hover:scale-[1.01] disabled:opacity-60"
              >
                {" "}
                <span className="absolute inset-0 translate-x-full admin-panel transition group-hover:translate-x-[-120%]" />{" "}
                <span className="relative">
                  {loading
                    ? "جاري التحقق وإنشاء الحساب..."
                    : "إنشاء الحساب والدخول"}
                </span>{" "}
              </button>{" "}
            </form>{" "}
            <p className="mt-7 text-center text-sm admin-text-subtle">
              {" "}
              لديك حساب؟{" "}
              <a href="/login" className="font-bold admin-text-muted underline">
                {" "}
                تسجيل الدخول{" "}
              </a>{" "}
            </p>{" "}
          </div>{" "}
        </section>{" "}
        <section className="relative hidden xl:flex overflow-hidden ui-public-seo-hero admin-panel-border p-10">
          {" "}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(37,99,235,0.42),transparent_34%),radial-gradient(circle_at_78%_70%,rgba(34,211,238,0.16),transparent_30%)]" />{" "}
          <div className="ui-public-seo-hero-glow ui-public-seo-hero-glow--primary ui-public-seo-hero-glow--left-auth" />{" "}
          <div className="absolute bottom-16 right-16 h-96 w-96 rounded-full admin-panel blur-3xl" />{" "}
          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            {" "}
            <div className="flex items-center justify-between gap-4">
              {" "}
              <div className="flex items-center gap-4">
                {" "}
                <RegisterBrandMark />{" "}
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
                Smart Trading Access{" "}
              </span>{" "}
            </div>{" "}
            <div className="max-w-3xl py-16">
              {" "}
              <span className="inline-flex rounded-full border admin-panel-border admin-panel px-4 py-2 text-sm font-bold admin-text-muted">
                {" "}
                انضم إلى المنصة{" "}
              </span>{" "}
              <h1 className="mt-7 text-6xl 2xl:text-7xl font-black leading-tight tracking-tight">
                {" "}
                حساب واحد لكل أدوات التداول والتحليل.{" "}
              </h1>{" "}
              <p className="mt-7 max-w-2xl text-lg leading-9 admin-text-muted">
                {" "}
                أنشئ حسابك للوصول إلى طلبات التحليل، التنبيهات السعرية، لوحة
                المستخدم، وردود الإدارة في تجربة واحدة متناسقة.{" "}
              </p>{" "}
            </div>{" "}
            <div className="grid grid-cols-3 gap-4">
              {" "}
              <div className="rounded-3xl border admin-panel-border ui-glass-5 p-5 backdrop-blur-xl">
                {" "}
                <strong className="block text-3xl admin-text-muted">
                  Secure
                </strong>{" "}
                <span className="text-sm admin-text-subtle">
                  تسجيل آمن
                </span>{" "}
              </div>{" "}
              <div className="rounded-3xl border admin-panel-border ui-glass-5 p-5 backdrop-blur-xl">
                {" "}
                <strong className="block text-3xl admin-text-muted">
                  Live
                </strong>{" "}
                <span className="text-sm admin-text-subtle">
                  بيانات مباشرة
                </span>{" "}
              </div>{" "}
              <div className="rounded-3xl border admin-panel-border ui-glass-5 p-5 backdrop-blur-xl">
                {" "}
                <strong className="block text-xl leading-7 admin-text-muted">
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
