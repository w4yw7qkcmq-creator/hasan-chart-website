"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAppModal } from "./components/AppModalProvider";

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
  const [activeNotice, setActiveNotice] = useState("");
  const [prices, setPrices] = useState({
    BTCUSDT: "0",
    ETHUSDT: "0",
    SOLUSDT: "0",
  });
  const [liveFeedStatus, setLiveFeedStatus] = useState("connecting");

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
      const response = await fetch(`/api/analysis-request?email=${encodeURIComponent(user.email)}`, {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `فشل التحقق من مدة الانتظار. كود الخطأ: ${response.status}`);
      }

      setCanRequestAnalysis(!result.blocked);
      setAnalysisCooldownText(result.text || "");
    } catch (err) {
      console.error("Cooldown check failed:", err);
      setCanRequestAnalysis(false);
      setAnalysisCooldownText("جاري التحقق من إمكانية إرسال طلب تحليل جديد...");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof WebSocket === "undefined") {
      setLiveFeedStatus("offline");
      return undefined;
    }

    let ws;
    let closedByCleanup = false;
    let reconnectTimer;

    const connect = () => {
      if (closedByCleanup) return;

      setLiveFeedStatus((current) => (current === "live" ? "live" : "connecting"));

      try {
        ws = new WebSocket(
          "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade"
        );
      } catch {
        setLiveFeedStatus("retrying");
        reconnectTimer = window.setTimeout(connect, 5000);
        return;
      }

      ws.onopen = () => {
        setLiveFeedStatus("live");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const d = msg.data;

          if (d?.s && d?.p) {
            const livePrice = Number(d.p);
            setPrices((prev) => ({
              ...prev,
              [d.s]: livePrice.toLocaleString(),
            }));
          }
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      ws.onerror = () => {
        if (!closedByCleanup) {
          setLiveFeedStatus((current) => (current === "live" ? "live" : "retrying"));
        }
      };

      ws.onclose = () => {
        if (closedByCleanup) return;

        setLiveFeedStatus("retrying");
        reconnectTimer = window.setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      clearTimeout(reconnectTimer);

      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");

    refreshAnalysisCooldown(user);

    const interval = setInterval(() => {
      const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
      refreshAnalysisCooldown(currentUser);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

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

    const user = requireLogin();
    if (!user) return;

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
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          user_email: user.email,
          username: user.username || user.email,
          coin: cleanCoin,
          price: cleanPrice,
          condition: "auto",
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `فشل إنشاء التنبيه. كود الخطأ: ${response.status}`);
      }

      showAppModal({
        type: "success",
        title: "تم إضافة التنبيه بنجاح",
        message: "وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      });

      setAlertCoin("");
      setAlertPrice("");
    } catch (err) {
      console.error("Submit alert error:", err);

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
                  <span className="site-market-pulse-badge">
                    {liveFeedStatus === "live" ? "Binance Live" : "جاري التحديث..."}
                  </span>
                </div>

                <div className="space-y-3">
                  <MiniTicker symbol="BTC" price={prices.BTCUSDT} live={liveFeedStatus === "live"} />
                  <MiniTicker symbol="ETH" price={prices.ETHUSDT} live={liveFeedStatus === "live"} />
                  <MiniTicker symbol="SOL" price={prices.SOLUSDT} live={liveFeedStatus === "live"} />
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

        <section id="chart">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h2 className="sectionTitle text-center lg:text-right">الشارت الحي</h2>
              <p className="mt-2 text-center text-sm text-slate-400 lg:text-right">
                اختر العملة والفريم الزمني لعرض الشارت المباشر.
              </p>
            </div>

            <div className="grid gap-3 lg:min-w-[640px]">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={chartSearch}
                  onChange={(e) => setChartSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyChartSearch();
                  }}
                  placeholder="ابحث عن أي عملة مثل BTC أو PEPE أو BTCUSDT"
                  className="input"
                />

                <button
                  onClick={applyChartSearch}
                  className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-3 font-black text-white shadow-[0_16px_40px_rgba(37,99,235,0.25)]"
                >
                  عرض الشارت
                </button>
              </div>

              <select
                value={chartInterval}
                onChange={(e) => setChartInterval(e.target.value)}
                className="input"
              >
                <option value="1">1 دقيقة</option>
                <option value="5">5 دقائق</option>
                <option value="15">15 دقيقة</option>
                <option value="60">1 ساعة</option>
                <option value="240">4 ساعات</option>
                <option value="D">يومي</option>
                <option value="W">أسبوعي</option>
              </select>

              {chartSearchError && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm font-bold text-red-100">
                  {chartSearchError}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/5">
            <iframe
              key={`${chartSymbol}-${chartInterval}`}
              src={`https://s.tradingview.com/widgetembed/?symbol=BINANCE:${chartSymbol}&interval=${chartInterval}&theme=dark&style=1&locale=ar`}
              width="100%"
              height="520"
              frameBorder="0"
              scrolling="no"
              title={`TradingView chart ${chartSymbol}`}
            />
          </div>
        </section>

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
              onClick={submitAlert}
              disabled={alertSubmitting}
              className={`greenBtn ${alertSubmitting ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {alertSubmitting ? "جاري تفعيل التنبيه..." : "تفعيل التنبيه"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Price({ title, symbol, price, source = "Binance Live" }) {
  return (
    <div className="box">
      <p className="text-slate-400">{title}</p>
      <h3 className="text-2xl font-black">{symbol}</h3>
      <p className="text-3xl font-black mt-4 text-emerald-400">${price}</p>
      <p className="text-xs text-emerald-400 mt-3">● {source}</p>
    </div>
  );
}

function TradingViewPrice({ title, symbol, tvSymbol }) {
  return (
    <div className="site-price-card site-price-card--tv">
      <p className="site-price-card__eyebrow">{title}</p>
      <h3 className="site-price-card__title">{symbol}</h3>
      <TradingViewWidget symbol={tvSymbol} height="120" />
    </div>
  );
}

function MiniTicker({ symbol, price, live = false }) {
  const displayPrice = live && price !== "0" ? `$${price}` : "جاري التحديث...";

  return (
    <div className="site-price-card site-price-card--pulse">
      <span className="site-price-card__title mb-0 text-base">{symbol}</span>
      <span className="site-price-card__value text-base">{displayPrice}</span>
    </div>
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

function MarketWindow({ title, label, symbol, widgetHeight = "120" }) {
  return (
    <div className="site-price-card site-price-card--tv">
      <p className="site-price-card__eyebrow">{label}</p>
      <h3 className="site-price-card__title">{title}</h3>
      <TradingViewWidget symbol={symbol} height={widgetHeight} />
    </div>
  );
}

function TradingViewWidget({ symbol, height = "120" }) {
  const containerRef = useRef(null);
  const [feedStatus, setFeedStatus] = useState("loading");

  useEffect(() => {
    if (!containerRef.current) return undefined;

    setFeedStatus("loading");
    containerRef.current.innerHTML = "";

    const widgetBox = document.createElement("div");
    widgetBox.className = "tradingview-widget-container__widget";
    containerRef.current.appendChild(widgetBox);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      isTransparent: false,
      colorTheme: "dark",
      locale: "ar",
    });

    script.onload = () => {
      setFeedStatus("live");
    };

    script.onerror = () => {
      setFeedStatus("updating");
    };

    containerRef.current.appendChild(script);

    const fallbackTimer = window.setTimeout(() => {
      setFeedStatus((current) => (current === "loading" ? "updating" : current));
    }, 8000);

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [symbol]);

  const statusLabel = feedStatus === "live" ? "TradingView Live" : "جاري التحديث...";

  return (
    <div>
      <div className="relative">
        <div
          ref={containerRef}
          className="tradingview-widget-container overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-[inset_0_0_30px_rgba(0,0,0,0.65)]"
          style={{ height }}
        />
        {feedStatus !== "live" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70 text-xs font-bold text-cyan-200">
            جاري التحديث...
          </div>
        ) : null}
      </div>
      <p className="site-price-card__status">● {statusLabel}</p>
    </div>
  );
}