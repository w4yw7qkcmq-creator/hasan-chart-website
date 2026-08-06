"use client";
import dynamic from "next/dynamic";
import { memo, useEffect, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";
import { createPriceAlert } from "../../lib/price-alert-create-client";
import { useAppModal } from "../components/AppModalProvider";
import { useAuth } from "../components/AuthProvider";
import { HomeMarketPulsePanel } from "../components/home/HomeMarketPulsePanel";
import { ui } from "../components/ui/ui-theme";
import { useVisibilityRefresh } from "../hooks/useVisibilityRefresh";
const HomeMarketWindowsSection = dynamic(
  () =>
    import("../components/market/HomeMarketWindowsSection").then(
      (mod) => mod.HomeMarketWindowsSection,
    ),
  {
    ssr: false,
    loading: () => (
      <section
        id="market-windows"
        className="site-market-windows-shell w-full"
        aria-busy="true"
        aria-live="polite"
      >
        {" "}
        <h2 className="sectionTitle text-center lg:text-right">
          نوافذ السوق السريعة
        </h2>{" "}
        <div className="market-windows-grid grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 w-full">
          {" "}
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={ui.homeSkeletonCard} />
          ))}{" "}
        </div>{" "}
      </section>
    ),
  },
);
const HomeLivePricesSection = dynamic(
  () =>
    import("../components/market/HomeLivePricesSection").then(
      (mod) => mod.HomeLivePricesSection,
    ),
  {
    ssr: false,
    loading: () => (
      <section
        id="prices"
        className="w-full"
        aria-busy="true"
        aria-live="polite"
      >
        {" "}
        <h2 className="sectionTitle text-center lg:text-right">
          الأسعار المباشرة
        </h2>{" "}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 w-full">
          {" "}
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={ui.homeSkeletonCard} />
          ))}{" "}
        </div>{" "}
      </section>
    ),
  },
);
const LiveChartSection = dynamic(
  () =>
    import("../components/market/LiveChartSection").then(
      (mod) => mod.LiveChartSection,
    ),
  {
    ssr: false,
    loading: () => (
      <section id="chart" className="site-live-chart-section w-full">
        {" "}
        <div className={ui.homeChartLoading}>جاري تحميل الشارت...</div>{" "}
      </section>
    ),
  },
);
const MARKET_WINDOWS = [
  { title: "BTC.D", label: "استحواذ البيتكوين", symbol: "CRYPTOCAP:BTC.D" },
  { title: "USDT.D", label: "استحواذ الدولار", symbol: "CRYPTOCAP:USDT.D" },
  { title: "USDT", label: "Market Cap USDT", symbol: "CRYPTOCAP:USDT" },
  {
    title: "OTHERS.D",
    label: "استحواذ العملات باستثناء التوب 10",
    symbol: "CRYPTOCAP:OTHERS.D",
  },
  {
    title: "OTHERS",
    label: "القيمة السوقية للعملات باستثناء توب 10",
    symbol: "CRYPTOCAP:OTHERS",
  },
];
const MARKET_WINDOW_WIDGET_HEIGHT = "136";
const ANALYSIS_FRAME_SUGGESTIONS = [
  { value: "4h", label: "4 ساعات", hint: "4h / 4 hours / أربع ساعات" },
  { value: "12h", label: "12 ساعة", hint: "12h / 12 hours / 12 ساعة" },
  { value: "1d", label: "يومي", hint: "1d / daily / يوم" },
  { value: "3d", label: "3 أيام", hint: "3d / 3 days / 3 أيام" },
  { value: "1w", label: "أسبوعي", hint: "1w / weekly / أسبوع" },
  { value: "2w", label: "أسبوعين", hint: "2w / 2 weeks / أسبوعين" },
  { value: "1M", label: "شهري", hint: "1M / monthly / شهر" },
  { value: "2M", label: "شهرين", hint: "2M / 2 months / شهرين" },
  { value: "1y", label: "سنة", hint: "1y / 1 year / سنة" },
];
export default function HomePageClient({ heroCopy }) {
  const { showAppModal } = useAppModal();
  const { authResolved, user } = useAuth();
  const [activeNotice, setActiveNotice] = useState("");
  const [analysisCoin, setAnalysisCoin] = useState("");
  const [analysisFrame, setAnalysisFrame] = useState("");
  const [analysisCooldownText, setAnalysisCooldownText] = useState("");
  const [analysisSubmitting, setAnalysisSubmitting] = useState(false);
  const [canRequestAnalysis, setCanRequestAnalysis] = useState(true);
  const [alertCoin, setAlertCoin] = useState("");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [chartSymbol, setChartSymbol] = useState("BTCUSDT");
  const [chartSearch, setChartSearch] = useState("BTCUSDT");
  const [chartInterval, setChartInterval] = useState("15");
  const [chartSearchError, setChartSearchError] = useState("");
  const getCooldownMessage = (createdAt) => {
    if (!createdAt) return { blocked: false, text: "" };
    const dayMs = 24 * 60 * 60 * 1000;
    const lastRequestTime = new Date(createdAt).getTime();
    const remainingMs = dayMs - (Date.now() - lastRequestTime);
    if (remainingMs <= 0) return { blocked: false, text: "" };
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      blocked: true,
      text: `يمكنك إرسال طلب تحليل جديد بعد ${hours} ساعة و ${minutes} دقيقة`,
    };
  };
  const refreshAnalysisCooldown = async (user) => {
    if (!user?.email) {
      setCanRequestAnalysis(false);
      setAnalysisCooldownText("");
      return;
    }
    setCanRequestAnalysis(false);
    try {
      const response = await fetchWithTimeout(
        `/api/analysis-request?email=${encodeURIComponent(user.email)}`,
        { method: "GET", cache: "no-store" },
        5000,
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error ||
            `فشل التحقق من مدة الانتظار. كود الخطأ: ${response.status}`,
        );
      }
      setCanRequestAnalysis(!result.blocked);
      setAnalysisCooldownText(result.text || "");
    } catch (err) {
      console.error("Cooldown check failed:", err);
      setCanRequestAnalysis(true);
      setAnalysisCooldownText("");
    }
  };
  useEffect(() => {
    if (!authResolved) return;
    void refreshAnalysisCooldown(user);
  }, [authResolved, user?.email]);
  useVisibilityRefresh(() => refreshAnalysisCooldown(user), {
    enabled: authResolved,
    intervalMs: 60000,
    refreshOnVisible: false,
    refreshOnFocus: false,
  });
  const requireLogin = () => {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    if (!user) {
      showAppModal({
        type: "warning",
        title: "يجب تسجيل الدخول",
        message: "يجب الدخول للحساب أولاً",
      });
      window.location.href = "/login";
      return null;
    }
    return user;
  };
  const submitAnalysis = async () => {
    if (analysisSubmitting) return;
    const user = requireLogin();
    if (!user) return;
    const cleanCoin = analysisCoin.trim().toUpperCase();
    const cleanFrame = analysisFrame.trim();
    if (!cleanCoin || !cleanFrame) {
      showAppModal({
        type: "warning",
        title: "بيانات ناقصة",
        message: "اكتب اسم العملة والفريم المطلوب.",
      });
      return;
    }
    if (!canRequestAnalysis) {
      setAnalysisCooldownText(
        analysisCooldownText ||
          "يمكنك إرسال طلب تحليل جديد بعد انتهاء مدة الانتظار",
      );
      return;
    }
    setAnalysisSubmitting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch("/api/analysis-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          user_email: user.email,
          username: user.username || user.email,
          coin: cleanCoin,
          frame: cleanFrame,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        if (response.status === 429 && result?.error) {
          setCanRequestAnalysis(false);
          setAnalysisCooldownText(result.error);
          showAppModal({
            type: "warning",
            title: "طلب التحليل غير متاح حالياً",
            message: result.error,
          });
          return;
        }
        throw new Error(
          result?.error ||
            `فشل إرسال طلب التحليل. كود الخطأ: ${response.status}`,
        );
      }
      setCanRequestAnalysis(false);
      setAnalysisCooldownText(
        "يمكنك إرسال طلب تحليل جديد بعد 24 ساعة و 0 دقيقة",
      );
      await refreshAnalysisCooldown(user);
      setAnalysisCoin("");
      setAnalysisFrame("");
      showAppModal({
        type: "success",
        title: "تم استلام طلب التحليل بنجاح",
        message: "سيتم مراجعة طلبك وإرسال الرد من الإدارة قريبًا.",
      });
    } catch (err) {
      console.error("Submit analysis error:", err);
      showAppModal({
        type: "error",
        title: "تعذر إرسال طلب التحليل",
        message:
          err?.name === "AbortError"
            ? "السيرفر لم يرد خلال 9 ثواني. جرّب مرة ثانية بعد قليل."
            : err?.message || "حدث خطأ أثناء إرسال طلب التحليل.",
      });
    } finally {
      clearTimeout(timeoutId);
      setAnalysisSubmitting(false);
    }
  };
  const applyChartSearch = async () => {
    const { warmupBybitNetwork } = await import("../../lib/bybit-network");
    warmupBybitNetwork();
    let symbol = String(chartSearch || "")
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9]/g, "");
    if (!symbol) {
      setChartSearchError("اكتب رمز العملة أولاً مثل BTC أو BTCUSDT");
      return;
    }
    if (!symbol.endsWith("USDT")) {
      symbol = `${symbol}USDT`;
    }
    setChartSearchError("");
    try {
      const response = await fetch(
        `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`,
        { headers: { Accept: "application/json" } },
      );
      const data = await response.json().catch(() => null);
      const foundPrice = Number(data?.result?.list?.[0]?.lastPrice);
      if (!response.ok || data?.retCode !== 0 || !Number.isFinite(foundPrice)) {
        setChartSearchError("لم يتم العثور على هذه العملة في سوق USDT");
        return;
      }
      setChartSymbol(symbol);
      setChartSearch(symbol);
    } catch (err) {
      console.error("Chart symbol search error:", err);
      setChartSearchError("حدث خطأ أثناء البحث عن العملة");
    }
  };
  const submitAlert = async () => {
    if (alertSubmitting) return;
    if (!authResolved) {
      showAppModal({
        type: "info",
        title: "جاري التحقق",
        message: "جاري التحقق من جلسة الدخول، حاول مرة أخرى بعد لحظات.",
      });
      return;
    }
    if (!user?.email) {
      showAppModal({
        type: "error",
        title: "يجب تسجيل الدخول",
        message: "يجب الدخول للحساب أولاً قبل إنشاء تنبيه سعري.",
      });
      window.location.href = "/login";
      return;
    }
    const cleanCoin = alertCoin.trim().toUpperCase();
    const cleanPrice = String(alertPrice || "").trim();
    if (!cleanCoin || !cleanPrice) {
      showAppModal({
        type: "warning",
        title: "بيانات ناقصة",
        message: "اكتب اسم العملة والسعر المطلوب",
      });
      return;
    }
    setAlertSubmitting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await createPriceAlert({
        coin: cleanCoin,
        price: cleanPrice,
        condition: "auto",
        signal: controller.signal,
      });
      if (!result?.alert?.id) {
        throw new Error("لم يتم حفظ التنبيه في قاعدة البيانات.");
      }
      showAppModal({
        type: "success",
        title: "تم إضافة التنبيه بنجاح",
        message: result?.message || "وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      });
      setAlertCoin("");
      setAlertPrice("");
    } catch (err) {
      console.error("PRICE_ALERT_CREATE_FAILED", err);
      showAppModal({
        type: "error",
        title: "تعذر إنشاء التنبيه",
        message:
          err?.name === "AbortError"
            ? "السيرفر لم يرد خلال 15 ثانية. جرّب مرة ثانية."
            : err?.message || "حدث خطأ أثناء إنشاء التنبيه",
      });
    } finally {
      clearTimeout(timeoutId);
      setAlertSubmitting(false);
    }
  };
  return (
    <main className={ui.homeRoot}>
      {" "}
      {activeNotice && (
        <div className={ui.homeNotice}>
          {" "}
          <div className="flex justify-between gap-4">
            {" "}
            <span>{activeNotice}</span>{" "}
            <button type="button" onClick={() => setActiveNotice("")}>
              ✕
            </button>{" "}
          </div>{" "}
        </div>
      )}{" "}
      <div className="space-y-10 w-full">
        {" "}
        <section className="glassPanel site-hero-section p-8 md:p-10 overflow-hidden relative">
          {" "}
          <div className={ui.homeHeroOverlay} />{" "}
          <div className="relative grid lg:grid-cols-12 gap-8 items-center">
            {" "}
            {heroCopy}{" "}
            <div className="lg:col-span-5">
              {" "}
              <HomeMarketPulsePanel />{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <HomeMarketWindowsSection
          marketWindows={MARKET_WINDOWS}
          widgetHeight={MARKET_WINDOW_WIDGET_HEIGHT}
        />{" "}
        <HomeLivePricesSection />{" "}
        <LiveChartSection
          chartSearch={chartSearch}
          setChartSearch={setChartSearch}
          chartInterval={chartInterval}
          setChartInterval={setChartInterval}
          chartSymbol={chartSymbol}
          chartSearchError={chartSearchError}
          onApplySearch={applyChartSearch}
        />{" "}
        <section id="services">
          {" "}
          <h2 className="sectionTitle text-center lg:text-right">
            الخدمات
          </h2>{" "}
          <div className="grid md:grid-cols-3 gap-5">
            {" "}
            <Service
              title="توصيات Spot"
              text="باقات سبوت شهرية وربع سنوية وسنوية."
              href="/subscriptions"
              onRequireLogin={requireLogin}
            />{" "}
            <Service
              title="توصيات Futures"
              text="فرص فيوتشر مع متابعة وإدارة مخاطر."
              href="/subscriptions"
              onRequireLogin={requireLogin}
            />{" "}
            <Service
              title="HasaN CharT Academy"
              text="محتوى تعليمي صور وفيديوهات للمشتركين."
              href="/daily-analysis"
              onRequireLogin={requireLogin}
            />{" "}
            <Service
              title="إدارة حسابات Spot"
              text="إدارة محافظ سبوت باحتراف."
              href="/account-management"
              onRequireLogin={requireLogin}
            />{" "}
            <Service
              title="إدارة حسابات Futures"
              text="إدارة حسابات فيوتشر."
              href="/account-management"
              onRequireLogin={requireLogin}
            />{" "}
            <Service
              title="أخبار وتحليلات"
              text="أهم الأخبار والتحليلات اليومية."
              href="/news"
              publicLink
            />{" "}
          </div>{" "}
        </section>{" "}
        <section className="grid lg:grid-cols-2 gap-6">
          {" "}
          <div id="analysis" className={ui.homeFormPanel}>
            {" "}
            <h2 className={ui.homeFormTitle}>🧠 طلب تحليل عملة</h2>{" "}
            <input
              value={analysisCoin}
              onChange={(e) => setAnalysisCoin(e.target.value)}
              placeholder="اسم العملة مثل BTCUSDT"
              className="input"
            />{" "}
            <div className="space-y-3">
              {" "}
              <input
                value={analysisFrame}
                onChange={(e) => setAnalysisFrame(e.target.value)}
                placeholder="اكتب الفريم بالعربي أو الإنجليزي: 12 hours / 12 ساعة / شهرين / سنة"
                className="input"
                list="analysis-frame-suggestions"
              />{" "}
              <datalist id="analysis-frame-suggestions">
                {" "}
                {ANALYSIS_FRAME_SUGGESTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {" "}
                    {item.hint}{" "}
                  </option>
                ))}{" "}
              </datalist>{" "}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {" "}
                {ANALYSIS_FRAME_SUGGESTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setAnalysisFrame(item.value)}
                    className={
                      analysisFrame === item.value
                        ? ui.homeFormChipActive
                        : ui.homeFormChip
                    }
                    title={item.hint}
                  >
                    {" "}
                    {item.label}{" "}
                  </button>
                ))}{" "}
              </div>{" "}
              <p className={ui.homeFormHint}>
                {" "}
                يمكنك كتابة الفريم بأي صيغة: 12h أو 12 hours أو 12 ساعة أو شهرين
                أو سنة.{" "}
              </p>{" "}
            </div>{" "}
            <button
              onClick={submitAnalysis}
              disabled={!canRequestAnalysis || analysisSubmitting}
              className={`blueBtn ${!canRequestAnalysis || analysisSubmitting ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {" "}
              {analysisSubmitting
                ? "جاري إرسال الطلب..."
                : canRequestAnalysis
                  ? "إرسال طلب التحليل"
                  : "طلب التحليل متاح كل 24 ساعة"}{" "}
            </button>{" "}
            {analysisCooldownText && (
              <div className={ui.homeFormCooldown}>
                ⏳ {analysisCooldownText}
              </div>
            )}{" "}
            <a href="/my-analysis" className={ui.homeFormLink}>
              {" "}
              عرض طلباتي وردود الإدارة{" "}
            </a>{" "}
          </div>{" "}
          <div id="alerts" className={ui.homeFormPanel}>
            {" "}
            <h2 className={ui.homeFormTitle}>🔔 تنبيه سعر</h2>{" "}
            <input
              value={alertCoin}
              onChange={(e) => setAlertCoin(e.target.value)}
              placeholder="اسم العملة مثل BTCUSDT"
              className="input"
            />{" "}
            <input
              value={alertPrice}
              onChange={(e) => setAlertPrice(e.target.value)}
              placeholder="السعر المطلوب"
              className="input"
            />{" "}
            <div className={`${ui.homeFormHint} text-center`}>
              {" "}
              اكتب السعر فقط، وسيتم تفعيل التنبيه تلقائيًا عند ملامسة السعر
              المحدد.{" "}
            </div>{" "}
            <button
              type="button"
              onClick={submitAlert}
              disabled={!authResolved || !user?.email || alertSubmitting}
              className={`greenBtn ${!authResolved || !user?.email || alertSubmitting ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {" "}
              {alertSubmitting ? "جاري تفعيل التنبيه..." : "تفعيل التنبيه"}{" "}
            </button>{" "}
          </div>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}
const Service = memo(function Service({
  title,
  text,
  href,
  publicLink = false,
  onRequireLogin,
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!href) return;
        if (!publicLink && onRequireLogin) {
          const user = onRequireLogin();
          if (!user) return;
        }
        window.location.href = href;
      }}
      className={ui.homeServiceCard}
    >
      {" "}
      <h3 className={ui.homeServiceTitle}>{title}</h3>{" "}
      <p className={ui.homeServiceText}>{text}</p>{" "}
      <span className={ui.homeServiceCta}>اطلب الخدمة</span>{" "}
    </button>
  );
});
