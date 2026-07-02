"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { fetchWithTimeout } from "../lib/fetch-with-timeout";
import { createPriceAlert } from "../lib/price-alert-create-client";
import { supabase } from "../lib/supabase";
import { MiniTicker } from "./components/market/MiniTicker";
import { useAppModal } from "./components/AppModalProvider";
import { useAuth } from "./components/AuthProvider";
import { useClientMounted } from "./hooks/useClientMounted";
import {
  DEFAULT_MARKET_PRICES,
  hasKnownMarketPrice,
  useMarketPulseStream,
} from "./hooks/useMarketPulseStream";

const LiveChartSection = dynamic(
  () => import("./components/market/LiveChartSection").then((mod) => mod.LiveChartSection),
  {
    ssr: false,
    loading: () => (
      <section id="chart" className="site-live-chart-section w-full">
        <div className="site-live-chart-panel glassPanel p-8 text-center text-sm text-slate-300">
          جاري تحميل الشارت...
        </div>
      </section>
    ),
  }
);

const TradingViewPrice = dynamic(
  () => import("./components/market/TradingViewWidgets").then((mod) => mod.TradingViewPrice),
  { ssr: false }
);

const MarketWindow = dynamic(
  () => import("./components/market/TradingViewWidgets").then((mod) => mod.MarketWindow),
  { ssr: false }
);

const withTimeout = (promise, ms, message = "REQUEST_TIMEOUT") => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

export default function Home() {
  const { showAppModal } = useAppModal();
  const { authResolved, user } = useAuth();
  const [activeNotice, setActiveNotice] = useState("");
  const { prices, liveFeedStatus } = useMarketPulseStream();
  const mounted = useClientMounted();

  const pulsePrices = mounted ? prices : DEFAULT_MARKET_PRICES;
  const pulseFeedStatus = mounted ? liveFeedStatus : "connecting";
  const pulseBadge = mounted
    ? liveFeedStatus === "live"
      ? "OKX Live"
      : hasKnownMarketPrice(prices)
        ? "آخر سعر معروف"
        : liveFeedStatus === "offline"
          ? "غير متاح مؤقتاً"
          : "جاري التحديث..."
    : "جاري التحديث...";

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

  const marketWindows = [
    { title: "BTC.D", label: "استحواذ البيتكوين", symbol: "CRYPTOCAP:BTC.D" },
    { title: "USDT.D", label: "استحواذ الدولار", symbol: "CRYPTOCAP:USDT.D" },
    { title: "USDT", label: "Market Cap USDT", symbol: "CRYPTOCAP:USDT" },
    { title: "OTHERS.D", label: "استحواذ العملات باستثناء التوب 10", symbol: "CRYPTOCAP:OTHERS.D" },
    { title: "OTHERS", label: "القيمة السوقية للعملات باستثناء توب 10", symbol: "CRYPTOCAP:OTHERS" },
  ];

  const marketWindowWidgetHeight = "136";

  const analysisFrameSuggestions = [
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
        {
          method: "GET",
          cache: "no-store",
        },
        5000
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `فشل التحقق من مدة الانتظار. كود الخطأ: ${response.status}`);
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
    if (!authResolved) return undefined;

    let interval;

    void refreshAnalysisCooldown(user);

    interval = window.setInterval(() => {
      void refreshAnalysisCooldown(user);
    }, 60000);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [authResolved, user?.email]);

  const checkUserAlerts = () => {
    return;
  };

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
        analysisCooldownText || "يمكنك إرسال طلب تحليل جديد بعد انتهاء مدة الانتظار"
      );
      return;
    }

    setAnalysisSubmitting(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch("/api/analysis-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

        throw new Error(result?.error || `فشل إرسال طلب التحليل. كود الخطأ: ${response.status}`);
      }

      setCanRequestAnalysis(false);
      setAnalysisCooldownText("يمكنك إرسال طلب تحليل جديد بعد 24 ساعة و 0 دقيقة");
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
        {
          headers: {
            Accept: "application/json",
          },
        }
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
        type: "warning",
        title: "يجب تسجيل الدخول",
        message: "يجب الدخول للحساب أولاً",
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
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      await createPriceAlert({
        coin: cleanCoin,
        price: cleanPrice,
        condition: "auto",
        signal: controller.signal,
      });

      showAppModal({
        type: "success",
        title: "تم إضافة التنبيه بنجاح",
        message: "وسيتم إرسال الإيميل فقط عند تحقق السعر.",
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
            ? "السيرفر لم يرد خلال 9 ثواني. جرّب مرة ثانية."
            : err?.message || "حدث خطأ أثناء إنشاء التنبيه",
      });
    } finally {
      clearTimeout(timeoutId);
      setAlertSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen text-white w-full">
      {activeNotice && (
        <div className="fixed top-5 left-5 z-[999] max-w-md rounded-3xl bg-emerald-500 text-black p-5 shadow-2xl font-bold">
          <div className="flex justify-between gap-4">
            <span>{activeNotice}</span>
            <button onClick={() => setActiveNotice("")}>✕</button>
          </div>
        </div>
      )}

      <div className="space-y-10 w-full">
        <section className="glassPanel site-hero-section p-8 md:p-10 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.28),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.18),transparent_30%)]" />

          <div className="relative grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-6">
              <span className="badgeGreen">LIVE TRADING INTELLIGENCE</span>

              <h1
                className="text-4xl md:text-6xl font-black leading-tight tracking-wide"
                style={{
                  color: "#ffffff",
                  WebkitTextFillColor: "#ffffff",
                  textShadow: "0 4px 8px rgba(0,0,0,0.85)",
                }}
              >
                منصة احترافية لمتابعة السوق وطلب التحليلات والتنبيهات السعرية
              </h1>

              <p
                className="text-lg font-bold leading-8 tracking-wide"
                style={{
                  color: "#ffffff",
                  WebkitTextFillColor: "#ffffff",
                  textShadow: "0 3px 6px rgba(0,0,0,0.82)",
                }}
              >
                HasaN CharT World تجمع الأسعار المباشرة، الشارت الحي، طلبات التحليل، التنبيهات، الاشتراكات، ولوحة مستخدم منظمة في تجربة واحدة.
              </p>

              <div className="flex flex-wrap gap-3">
                <a
                  href="#analysis"
                  className="px-6 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-bold transition"
                  style={{
                    color: "#ffffff",
                    WebkitTextFillColor: "#ffffff",
                    textShadow: "0 2px 4px rgba(0,0,0,0.75)",
                  }}
                >
                  🧠 طلب تحليل الآن
                </a>
                <a
                  href="#alerts"
                  className="px-6 py-4 rounded-2xl bg-emerald-400 hover:bg-emerald-300 font-bold transition"
                  style={{
                    color: "#ffffff",
                    WebkitTextFillColor: "#ffffff",
                    textShadow: "0 2px 4px rgba(0,0,0,0.75)",
                  }}
                >
                  🔔 إنشاء تنبيه سعر
                </a>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="site-market-pulse-panel">
                <div className="site-market-pulse-header flex items-center justify-between gap-3 mb-5">
                  <div>
                    <p className="site-price-card__eyebrow">Market Pulse</p>
                    <h3 className="site-price-card__title mb-0">BTC / ETH / SOL</h3>
                  </div>
                  <span className="site-market-pulse-badge">{pulseBadge}</span>
                </div>

                <div className="space-y-3">
                  <MiniTicker
                    symbol="BTC"
                    price={pulsePrices.BTCUSDT}
                    feedStatus={pulseFeedStatus}
                  />
                  <MiniTicker
                    symbol="ETH"
                    price={pulsePrices.ETHUSDT}
                    feedStatus={pulseFeedStatus}
                  />
                  <MiniTicker
                    symbol="SOL"
                    price={pulsePrices.SOLUSDT}
                    feedStatus={pulseFeedStatus}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="market-windows" className="w-full">
          <h2 className="sectionTitle text-center lg:text-right">نوافذ السوق السريعة</h2>

          <div className="market-windows-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 w-full">
            {marketWindows.map((item) => (
              <MarketWindow
                key={item.title}
                title={item.title}
                label={item.label}
                symbol={item.symbol}
                widgetHeight={marketWindowWidgetHeight}
              />
            ))}
          </div>
        </section>

        <section id="prices" className="w-full">
          <h2 className="sectionTitle text-center lg:text-right">الأسعار المباشرة</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 w-full">
            <TradingViewPrice title="Bitcoin" symbol="BTC" tvSymbol="BINANCE:BTCUSDT" />
            <TradingViewPrice title="Ethereum" symbol="ETH" tvSymbol="BINANCE:ETHUSDT" />
            <TradingViewPrice title="Solana" symbol="SOL" tvSymbol="BINANCE:SOLUSDT" />
            <TradingViewPrice title="Gold Ounce" symbol="GOLD" tvSymbol="OANDA:XAUUSD" />
            <TradingViewPrice title="Silver Ounce" symbol="SILVER" tvSymbol="OANDA:XAGUSD" />
          </div>
        </section>

        <LiveChartSection
          chartSearch={chartSearch}
          setChartSearch={setChartSearch}
          chartInterval={chartInterval}
          setChartInterval={setChartInterval}
          chartSymbol={chartSymbol}
          chartSearchError={chartSearchError}
          onApplySearch={applyChartSearch}
        />

        <section id="services">
          <h2 className="sectionTitle text-center lg:text-right">الخدمات</h2>

          <div className="grid md:grid-cols-3 gap-5">
            <Service title="توصيات Spot" text="باقات سبوت شهرية وربع سنوية وسنوية." href="/subscriptions" onRequireLogin={requireLogin} />
            <Service title="توصيات Futures" text="فرص فيوتشر مع متابعة وإدارة مخاطر." href="/subscriptions" onRequireLogin={requireLogin} />
            <Service title="HasaN CharT Academy" text="محتوى تعليمي صور وفيديوهات للمشتركين." href="/daily-analysis" onRequireLogin={requireLogin} />
            <Service title="إدارة حسابات Spot" text="إدارة محافظ سبوت باحتراف." href="/account-management" onRequireLogin={requireLogin} />
            <Service title="إدارة حسابات Futures" text="إدارة حسابات فيوتشر." href="/account-management" onRequireLogin={requireLogin} />
            <Service title="أخبار وتحليلات" text="أهم الأخبار والتحليلات اليومية." href="/news" publicLink />
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-6">
          <div id="analysis" className="rounded-[28px] border border-blue-300/70 bg-gradient-to-br from-sky-400/85 via-blue-400/85 to-cyan-400/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_14px_34px_rgba(37,99,235,0.22)]">
            <h2
              className="mb-5 text-3xl font-black tracking-wide"
              style={{
                color: '#ffffff',
                WebkitTextFillColor: '#ffffff',
                textShadow: '0 2px 0 #000, 0 0 6px rgba(0,0,0,0.55)',
              }}
            >
              🧠 طلب تحليل عملة
            </h2>

            <input
              value={analysisCoin}
              onChange={(e) => setAnalysisCoin(e.target.value)}
              placeholder="اسم العملة مثل BTCUSDT"
              className="input"
            />

            <div className="space-y-3">
              <input
                value={analysisFrame}
                onChange={(e) => setAnalysisFrame(e.target.value)}
                placeholder="اكتب الفريم بالعربي أو الإنجليزي: 12 hours / 12 ساعة / شهرين / سنة"
                className="input"
                list="analysis-frame-suggestions"
              />

              <datalist id="analysis-frame-suggestions">
                {analysisFrameSuggestions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.hint}
                  </option>
                ))}
              </datalist>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {analysisFrameSuggestions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setAnalysisFrame(item.value)}
                    className={`rounded-2xl border px-3 py-2 text-sm font-black transition ${
                      analysisFrame === item.value
                        ? "border-white bg-white text-blue-700"
                        : "border-white/25 bg-white/15 text-white hover:bg-white/25"
                    }`}
                    title={item.hint}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <p
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold leading-7"
                style={{
                  color: "#ffffff",
                  WebkitTextFillColor: "#ffffff",
                  textShadow: "0 1px 0 #000, 0 0 4px rgba(0,0,0,0.55)",
                }}
              >
                يمكنك كتابة الفريم بأي صيغة: 12h أو 12 hours أو 12 ساعة أو شهرين أو سنة.
              </p>
            </div>

            <button
              onClick={submitAnalysis}
              disabled={!canRequestAnalysis || analysisSubmitting}
              className={`blueBtn ${!canRequestAnalysis || analysisSubmitting ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {analysisSubmitting
                ? "جاري إرسال الطلب..."
                : canRequestAnalysis
                ? "إرسال طلب التحليل"
                : "طلب التحليل متاح كل 24 ساعة"}
            </button>

            {analysisCooldownText && (
              <div
                className="mt-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-bold leading-7"
                style={{
                  color: '#ffffff',
                  WebkitTextFillColor: '#ffffff',
                  textShadow: '0 1px 0 #000, 0 0 4px rgba(0,0,0,0.55)',
                }}
              >
                ⏳ {analysisCooldownText}
              </div>
            )}

            <a
              href="/my-analysis"
              className="block text-center mt-3 underline"
              style={{
                color: '#ffffff',
                WebkitTextFillColor: '#ffffff',
                textShadow: '0 1px 0 #000, 0 0 4px rgba(0,0,0,0.55)',
              }}
            >
              عرض طلباتي وردود الإدارة
            </a>
          </div>

          <div id="alerts" className="rounded-[28px] border border-blue-300/70 bg-gradient-to-br from-sky-400/85 via-blue-400/85 to-cyan-400/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_14px_34px_rgba(37,99,235,0.22)]">
            <h2
              className="mb-5 text-3xl font-black tracking-wide"
              style={{
                color: '#ffffff',
                WebkitTextFillColor: '#ffffff',
                textShadow: '0 2px 0 #000, 0 0 6px rgba(0,0,0,0.55)',
              }}
            >
              🔔 تنبيه سعر
            </h2>

            <input
              value={alertCoin}
              onChange={(e) => setAlertCoin(e.target.value)}
              placeholder="اسم العملة مثل BTCUSDT"
              className="input"
            />

            <input
              value={alertPrice}
              onChange={(e) => setAlertPrice(e.target.value)}
              placeholder="السعر المطلوب"
              className="input"
            />

            <div
              className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-bold leading-7"
              style={{
                color: '#ffffff',
                WebkitTextFillColor: '#ffffff',
                textShadow: '0 1px 0 #000, 0 0 4px rgba(0,0,0,0.55)',
              }}
            >
              اكتب السعر فقط، وسيتم تفعيل التنبيه تلقائيًا عند ملامسة السعر المحدد.
            </div>

            <button
              type="button"
              onClick={submitAlert}
              disabled={!authResolved || !user?.email || alertSubmitting}
              className={`greenBtn ${!authResolved || !user?.email || alertSubmitting ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {alertSubmitting ? "جاري تفعيل التنبيه..." : "تفعيل التنبيه"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Service({ title, text, href, publicLink = false, onRequireLogin }) {
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
      className="w-full rounded-[28px] border border-blue-300/70 bg-gradient-to-br from-sky-400/85 via-blue-400/85 to-cyan-400/80 p-6 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_14px_34px_rgba(37,99,235,0.22)] transition hover:scale-[1.02] hover:border-blue-200/90"
    >
      <h3
        className="mb-3 text-xl font-black tracking-wide"
        style={{
          color: "#ffffff",
          WebkitTextFillColor: "#ffffff",
          textShadow: "0 2px 0 #000, 0 0 6px rgba(0,0,0,0.55)",
        }}
      >
        {title}
      </h3>
      <p
        className="leading-7 font-bold"
        style={{
          color: "#ffffff",
          WebkitTextFillColor: "#ffffff",
          textShadow: "0 1px 0 #000, 0 0 4px rgba(0,0,0,0.55)",
        }}
      >
        {text}
      </p>
      <span
        className="mt-5 inline-block rounded-2xl border border-white/20 bg-white/15 px-4 py-2 text-sm font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        style={{
          color: "#ffffff",
          WebkitTextFillColor: "#ffffff",
          textShadow: "0 1px 0 #000, 0 0 4px rgba(0,0,0,0.55)",
        }}
      >
        اطلب الخدمة
      </span>
    </button>
  );
}