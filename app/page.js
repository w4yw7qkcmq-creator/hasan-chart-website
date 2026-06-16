"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

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
  const [activeNotice, setActiveNotice] = useState("");
  const [successModal, setSuccessModal] = useState(null);
  const [prices, setPrices] = useState({
    BTCUSDT: "0",
    ETHUSDT: "0",
    SOLUSDT: "0",
  });

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
    { title: "USDT", label: "سعر USDT", symbol: "CRYPTOCAP:USDT" },
    { title: "OTHERS.D", label: "استحواذ OTHERS.D", symbol: "CRYPTOCAP:OTHERS.D" },
    { title: "OTHERS", label: "قيمة OTHERS", symbol: "CRYPTOCAP:OTHERS" },
    { title: "GOLD", label: "سعر أونصة الذهب", symbol: "OANDA:XAUUSD" },
    { title: "SILVER", label: "سعر أونصة الفضة", symbol: "OANDA:XAGUSD" },
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
    const ws = new WebSocket(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade"
    );

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const d = msg.data;

      if (d?.s && d?.p) {
        const livePrice = Number(d.p);
        setPrices((prev) => ({
          ...prev,
          [d.s]: livePrice.toLocaleString(),
        }));
      }
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    const originalAlert = window.alert;

    window.alert = (message) => {
      const text = String(message || "");

      if (text.includes("تم إضافة التنبيه بنجاح") || text.includes("سيتم إرسال الإيميل فقط عند تحقق السعر")) {
        setSuccessModal({
          title: "تم إضافة التنبيه بنجاح",
          message: "وسيتم إرسال الإيميل فقط عند تحقق السعر.",
        });
        return;
      }

      if (text.includes("تم استلام طلب التحليل")) {
        setSuccessModal({
          title: "تم استلام طلب التحليل بنجاح",
          message: "سيتم مراجعة طلبك وإرسال الرد من الإدارة قريبًا.",
        });
        return;
      }

      if (text.includes("يمكنك إرسال طلب تحليل جديد بعد") || text.includes("يمكنك طلب تحليل عملة مرة واحدة كل 24 ساعة")) {
        setCanRequestAnalysis(false);
        setAnalysisCooldownText(text.replace("يمكنك طلب تحليل عملة مرة واحدة كل 24 ساعة. ", ""));
        return;
      }

      originalAlert(message);
    };

    return () => {
      window.alert = originalAlert;
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
      alert("يجب الدخول للحساب أولاً");
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
      alert("اكتب اسم العملة والفريم المطلوب");
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
          return;
        }

        throw new Error(result?.error || `فشل إرسال طلب التحليل. كود الخطأ: ${response.status}`);
      }

      setCanRequestAnalysis(false);
      setAnalysisCooldownText("يمكنك إرسال طلب تحليل جديد بعد 24 ساعة و 0 دقيقة");
      await refreshAnalysisCooldown(user);
      setAnalysisCoin("");
      setAnalysisFrame("");
      setSuccessModal({
        title: "تم استلام طلب التحليل بنجاح",
        message: "سيتم مراجعة طلبك وإرسال الرد من الإدارة قريبًا.",
      });
    } catch (err) {
      console.error("Submit analysis error:", err);

      if (err?.name === "AbortError") {
        alert("السيرفر لم يرد خلال 9 ثواني. تأكد أن SUPABASE_SERVICE_ROLE_KEY مضاف في Vercel Production ثم أعد النشر.");
      } else {
        alert(err?.message || "حدث خطأ أثناء إرسال طلب التحليل");
      }
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
      alert("اكتب اسم العملة والسعر المطلوب");
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

      setSuccessModal({
        title: "تم إضافة التنبيه بنجاح",
        message: "وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      });

      setAlertCoin("");
      setAlertPrice("");
    } catch (err) {
      console.error("Submit alert error:", err);

      if (err?.name === "AbortError") {
        alert("السيرفر لم يرد خلال 9 ثواني. جرّب مرة ثانية.");
      } else {
        alert(err?.message || "حدث خطأ أثناء إنشاء التنبيه");
      }
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

      {successModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="successAlertCard w-full max-w-[620px] rounded-[32px] p-8 text-center shadow-2xl md:p-10" dir="rtl">
            <div className="mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-emerald-400 text-6xl font-black text-emerald-400 shadow-[0_0_34px_rgba(52,211,153,0.35)]">
              ✓
            </div>

            <h3 className="text-3xl font-black leading-relaxed md:text-4xl">
              {successModal.title}
            </h3>

            <p className="mt-4 text-lg font-semibold leading-9 text-slate-600 dark:text-slate-300 md:text-xl">
              {successModal.message}
            </p>

            <div className="mt-10 flex justify-start">
              <button
                type="button"
                onClick={() => setSuccessModal(null)}
                className="rounded-2xl px-5 py-3 text-lg font-black text-blue-500 transition hover:text-blue-400"
              >
                حسنًا
              </button>
            </div>
          </div>

          <style jsx>{`
            .successAlertCard {
              background: rgba(255, 255, 255, 0.96);
              color: #020617;
              border: 1px solid rgba(148, 163, 184, 0.28);
              box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
            }

            @media (prefers-color-scheme: dark) {
              .successAlertCard {
                background: radial-gradient(circle at top, rgba(37, 99, 235, 0.18), transparent 34%), #07142f;
                color: #ffffff;
                border: 1px solid rgba(59, 130, 246, 0.9);
                box-shadow: 0 0 42px rgba(37, 99, 235, 0.32), 0 24px 70px rgba(0, 0, 0, 0.42);
              }
            }
          `}</style>
        </div>
      )}

      <div className="space-y-10 w-full">
        <section className="glassPanel p-8 md:p-10 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.28),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.18),transparent_30%)]" />

          <div className="relative grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-6">
              <span className="badgeGreen">LIVE TRADING INTELLIGENCE</span>

              <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-wide !text-white drop-shadow-[0_4px_5px_rgba(0,0,0,0.95)] [text-shadow:_0_2px_0_#000,_0_-2px_0_#000,_2px_0_0_#000,_-2px_0_0_#000,_0_0_18px_rgba(255,255,255,0.18)]">
                منصة احترافية لمتابعة السوق وطلب التحليلات والتنبيهات السعرية
              </h1>

              <p className="text-lg font-bold leading-8 tracking-wide !text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.95)] [text-shadow:_0_1px_0_#000,_0_-1px_0_#000,_1px_0_0_#000,_-1px_0_0_#000,_0_0_12px_rgba(255,255,255,0.14)]">
                HasaN CharT World تجمع الأسعار المباشرة، الشارت الحي، طلبات التحليل، التنبيهات، الاشتراكات، ولوحة مستخدم منظمة في تجربة واحدة.
              </p>

              <div className="flex flex-wrap gap-3">
                <a
                  href="#analysis"
                  className="px-6 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-bold transition"
                >
                  🧠 طلب تحليل الآن
                </a>
                <a
                  href="#alerts"
                  className="px-6 py-4 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-black font-bold transition"
                >
                  🔔 إنشاء تنبيه سعر
                </a>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-[32px] bg-black/30 border border-white/10 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-slate-400 text-sm">Market Pulse</p>
                    <h3 className="text-2xl font-black">BTC / ETH / SOL</h3>
                  </div>
                  <span className="badgeBlue">WebSocket</span>
                </div>

                <div className="space-y-3">
                  <MiniTicker symbol="BTC" price={prices.BTCUSDT} />
                  <MiniTicker symbol="ETH" price={prices.ETHUSDT} />
                  <MiniTicker symbol="SOL" price={prices.SOLUSDT} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="market-windows" className="w-full">
          <h2 className="sectionTitle text-center lg:text-right">نوافذ السوق السريعة</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-5 w-full">
            {marketWindows.map((item) => (
              <MarketWindow
                key={item.title}
                title={item.title}
                label={item.label}
                symbol={item.symbol}
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
              allowTransparency="true"
              scrolling="no"
            />
          </div>
        </section>

        <section id="services">
          <h2 className="sectionTitle text-center lg:text-right">الخدمات</h2>

          <div className="grid md:grid-cols-3 gap-5">
            <Service title="توصيات Spot" text="باقات سبوت شهرية وربع سنوية وسنوية." onRequireLogin={requireLogin} />
            <Service title="توصيات Futures" text="فرص فيوتشر مع متابعة وإدارة مخاطر." onRequireLogin={requireLogin} />
            <Service title="HasaN CharT Academy" text="محتوى تعليمي صور وفيديوهات للمشتركين." onRequireLogin={requireLogin} />
            <Service title="إدارة حسابات Spot" text="إدارة محافظ سبوت باحتراف." onRequireLogin={requireLogin} />
            <Service title="إدارة حسابات Futures" text="إدارة حسابات فيوتشر." onRequireLogin={requireLogin} />
            <Service title="أخبار وتحليلات" text="أهم الأخبار والتحليلات اليومية." onRequireLogin={requireLogin} />
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-6">
          <div id="analysis" className="box">
            <h2 className="text-3xl font-black mb-5">🧠 طلب تحليل عملة</h2>

            <input
              value={analysisCoin}
              onChange={(e) => setAnalysisCoin(e.target.value)}
              placeholder="اسم العملة مثل BTCUSDT"
              className="input"
            />

            <input
              value={analysisFrame}
              onChange={(e) => setAnalysisFrame(e.target.value)}
              placeholder="الفريم المطلوب مثل 15m / 1h / 4h"
              className="input"
            />

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
              <div className="mt-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-center text-sm font-bold leading-7 text-blue-100 shadow-[0_0_18px_rgba(59,130,246,0.18)]">
                ⏳ {analysisCooldownText}
              </div>
            )}

            <a href="/my-analysis" className="block text-center mt-3 text-blue-400 underline">
              عرض طلباتي وردود الإدارة
            </a>
          </div>

          <div id="alerts" className="box">
            <h2 className="text-3xl font-black mb-5">🔔 تنبيه سعر</h2>

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

            <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-center text-sm font-bold leading-7 text-blue-100">
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
    <div className="rounded-[28px] border border-slate-700/80 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.30)] transition hover:scale-[1.02]">
      <p className="text-sm font-black tracking-wide !text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)] [text-shadow:_0_1px_0_#000,_0_-1px_0_#000,_1px_0_0_#000,_-1px_0_0_#000]">{title}</p>
      <h3 className="mt-2 mb-3 text-2xl font-black tracking-wide !text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.95)] [text-shadow:_0_1px_0_#000,_0_-1px_0_#000,_1px_0_0_#000,_-1px_0_0_#000,_0_0_12px_rgba(255,255,255,0.18)]">{symbol}</h3>
      <TradingViewWidget symbol={tvSymbol} height="120" />
      <p className="mt-3 text-xs font-bold text-cyan-300">● TradingView Live</p>
    </div>
  );
}

function MiniTicker({ symbol, price }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 p-4">
      <span className="font-black text-white">{symbol}</span>
      <span className="text-emerald-400 font-black">${price}</span>
    </div>
  );
}

function Service({ title, text, onRequireLogin }) {
  return (
    <button
      type="button"
      onClick={onRequireLogin}
      className="box w-full text-right transition hover:scale-[1.02] hover:border-blue-400/40"
    >
      <h3 className="text-xl font-black mb-3">{title}</h3>
      <p className="text-slate-400 leading-7">{text}</p>
      <span className="mt-5 inline-block rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white">
        اطلب الخدمة
      </span>
    </button>
  );
}

function MarketWindow({ title, label, symbol }) {
  return (
    <div className="min-h-[230px] overflow-hidden rounded-[28px] border border-slate-700/80 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.30)] transition hover:scale-[1.02]">
      <p className="text-sm font-black tracking-wide !text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)] [text-shadow:_0_1px_0_#000,_0_-1px_0_#000,_1px_0_0_#000,_-1px_0_0_#000]">{label}</p>
      <h3 className="mt-2 mb-3 text-2xl font-black tracking-wide !text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.95)] [text-shadow:_0_1px_0_#000,_0_-1px_0_#000,_1px_0_0_#000,_-1px_0_0_#000,_0_0_12px_rgba(255,255,255,0.18)]">{title}</h3>
      <TradingViewWidget symbol={symbol} height="120" />
      <p className="mt-3 text-xs font-bold text-cyan-300">● TradingView Live</p>
    </div>
  );
}

function TradingViewWidget({ symbol, height = "120" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

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

    containerRef.current.appendChild(script);
  }, [symbol]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-[inset_0_0_30px_rgba(0,0,0,0.65)]"
      style={{ height }}
    />
  );
}