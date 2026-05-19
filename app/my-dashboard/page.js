"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

function StatCard({ title, value, subtitle, icon, glow = "blue" }) {
  const glowClass =
    glow === "green"
      ? "from-emerald-400/20 to-cyan-400/10"
      : glow === "orange"
      ? "from-amber-400/20 to-orange-400/10"
      : "from-blue-500/20 to-cyan-400/10";

  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-[0_18px_55px_rgba(0,102,255,0.14)] backdrop-blur-2xl transition hover:-translate-y-1 hover:border-cyan-300/35 hover:shadow-[0_24px_70px_rgba(0,102,255,0.22)]">
      <div className={`absolute inset-0 bg-gradient-to-br ${glowClass} opacity-70`} />
      <div className="absolute -left-12 -top-12 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl transition group-hover:bg-cyan-400/20" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-400">{title}</p>
          <h3 className="mt-3 text-4xl font-black text-white">{value}</h3>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-black/25 text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, icon, title, text }) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-[26px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#06112b]/85 to-[#020617]/90 p-5 shadow-[0_16px_45px_rgba(0,102,255,0.14)] transition hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-[0_20px_60px_rgba(0,102,255,0.24)]"
    >
      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,0.18),transparent_34%)]" />
      <div className="relative z-10 flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
          {icon}
        </div>
        <div>
          <h3 className="font-black text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
        </div>
      </div>
    </Link>
  );
}


function StatusBadge({ status }) {
  const isDone = status === "triggered" || status === "مكتمل";
  const label = status === "triggered" ? "تم الوصول" : status === "active" ? "نشط" : status || "غير محدد";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black ${
        isDone
          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
          : "border-cyan-300/25 bg-cyan-400/10 text-cyan-200"
      }`}
    >
      {label}
    </span>
  );
}

function RealCandlestickChart({ result }) {
  const candles = Array.isArray(result?.chartData) ? result.chartData.slice(-70) : [];

  if (candles.length < 5) {
    return null;
  }

  const width = 1180;
  const height = 620;
  const padding = { top: 70, right: 92, bottom: 90, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const highs = candles.map((candle) => Number(candle.high)).filter(Number.isFinite);
  const lows = candles.map((candle) => Number(candle.low)).filter(Number.isFinite);
  const maxPrice = Math.max(...highs, Number(result?.target2 || 0), Number(result?.stopLoss || 0));
  const minPrice = Math.min(...lows, Number(result?.target2 || Infinity), Number(result?.stopLoss || Infinity));
  const priceRange = Math.max(maxPrice - minPrice, Math.abs(maxPrice) * 0.01 || 1);
  const toY = (price) => padding.top + ((maxPrice - Number(price)) / priceRange) * chartHeight;
  const candleStep = chartWidth / Math.max(candles.length - 1, 1);
  const candleWidth = Math.max(5, Math.min(16, candleStep * 0.55));
  const direction = String(result?.direction || result?.trend || result?.marketBias || "neutral").toLowerCase();
  const isBearish = direction.includes("bear");
  const isBullish = direction.includes("bull");
  const biasText = isBullish ? "Bullish" : isBearish ? "Bearish" : "Neutral";

  const levels = [
    { key: "entry", label: "ENTRY", value: Number(result?.entry), color: "#22c55e" },
    { key: "stop", label: "SL", value: Number(result?.stopLoss), color: "#ef4444" },
    { key: "target1", label: "TP1", value: Number(result?.target1), color: "#60a5fa" },
    { key: "target2", label: "TP2", value: Number(result?.target2), color: "#38bdf8" },
  ].filter((level) => Number.isFinite(level.value));

  const resistanceY = Number.isFinite(Number(result?.resistance)) ? toY(result.resistance) : null;
  const supportY = Number.isFinite(Number(result?.support)) ? toY(result.support) : null;

  return (
    <div className="mt-6 overflow-hidden rounded-[30px] border border-cyan-300/20 bg-[#020817] p-3 shadow-[0_0_45px_rgba(34,211,238,0.14)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full rounded-[24px] bg-[#020817]" role="img" aria-label={`Real candlestick chart for ${result?.symbol || "symbol"}`}>
        <defs>
          <linearGradient id="realChartBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#020617" />
            <stop offset="55%" stopColor="#07142f" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <filter id="chartGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={width} height={height} rx="28" fill="url(#realChartBg)" />
        <rect x="22" y="20" width={width - 44} height={height - 40} rx="26" fill="#020817" opacity="0.72" stroke="#155e75" strokeOpacity="0.42" />

        <text x="48" y="52" fill="#ffffff" fontSize="26" fontWeight="900">
          {result?.symbol || "MARKET"} · Real OHLC Chart
        </text>
        <text x="48" y="82" fill="#67e8f9" fontSize="16" fontWeight="800">
          SMC / ICT / Classic · 15m candles from OKX
        </text>

        <rect x={width - 255} y="38" width="205" height="54" rx="18" fill="#07142f" stroke="#22d3ee" strokeOpacity="0.38" />
        <text x={width - 232} y="62" fill="#94a3b8" fontSize="13" fontWeight="700">Market Bias</text>
        <text x={width - 232} y="84" fill={isBullish ? "#34d399" : isBearish ? "#fb7185" : "#67e8f9"} fontSize="19" fontWeight="900">{biasText}</text>

        {Array.from({ length: 7 }, (_, index) => {
          const y = padding.top + (chartHeight / 6) * index;
          const price = maxPrice - (priceRange / 6) * index;
          return (
            <g key={`grid-y-${index}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#94a3b8" strokeOpacity="0.12" />
              <text x={width - padding.right + 14} y={y + 5} fill="#94a3b8" fontSize="12" fontWeight="700">
                {price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 10 }, (_, index) => {
          const x = padding.left + (chartWidth / 9) * index;
          return <line key={`grid-x-${index}`} x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#94a3b8" strokeOpacity="0.09" />;
        })}

        {supportY && (
          <g>
            <rect x={padding.left} y={supportY - 20} width={chartWidth} height="40" rx="12" fill="#064e3b" opacity="0.18" />
            <line x1={padding.left} y1={supportY} x2={width - padding.right} y2={supportY} stroke="#34d399" strokeDasharray="10 10" strokeOpacity="0.7" />
            <text x={padding.left + 12} y={supportY - 8} fill="#a7f3d0" fontSize="14" fontWeight="900">Support / Demand</text>
          </g>
        )}

        {resistanceY && (
          <g>
            <rect x={padding.left} y={resistanceY - 20} width={chartWidth} height="40" rx="12" fill="#7f1d1d" opacity="0.18" />
            <line x1={padding.left} y1={resistanceY} x2={width - padding.right} y2={resistanceY} stroke="#fb7185" strokeDasharray="10 10" strokeOpacity="0.7" />
            <text x={padding.left + 12} y={resistanceY - 8} fill="#fecaca" fontSize="14" fontWeight="900">Resistance / Supply</text>
          </g>
        )}

        {levels.map((level) => {
          const y = toY(level.value);
          return (
            <g key={level.key}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={level.color} strokeWidth="2" strokeDasharray="8 8" strokeOpacity="0.84" />
              <rect x={width - padding.right - 155} y={y - 16} width="150" height="32" rx="10" fill="#020817" stroke={level.color} strokeOpacity="0.55" />
              <text x={width - padding.right - 142} y={y + 5} fill={level.color} fontSize="14" fontWeight="900">
                {level.label} {level.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </text>
            </g>
          );
        })}

        {candles.map((candle, index) => {
          const x = padding.left + index * candleStep;
          const openY = toY(candle.open);
          const closeY = toY(candle.close);
          const highY = toY(candle.high);
          const lowY = toY(candle.low);
          const isUp = Number(candle.close) >= Number(candle.open);
          const color = isUp ? "#34d399" : "#fb7185";
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));

          return (
            <g key={`${candle.time}-${index}`} filter={index > candles.length - 8 ? "url(#chartGlow)" : undefined}>
              <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth="2" strokeLinecap="round" />
              <rect x={x - candleWidth / 2} y={bodyY} width={candleWidth} height={bodyHeight} rx="3" fill={color} opacity="0.92" />
            </g>
          );
        })}

        <text x="48" y={height - 38} fill="#cbd5e1" fontSize="14" fontWeight="700">
          Real market candles · Entry/SL/TP drawn from AI + technical analysis · Educational only
        </text>
      </svg>
    </div>
  );
}

export default function MyDashboard() {
  const [user, setUser] = useState(null);
  const [myAlerts, setMyAlerts] = useState([]);
  const [myAnalysis, setMyAnalysis] = useState([]);
  const [aiSymbol, setAiSymbol] = useState("BTCUSDT");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingText, setAiLoadingText] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [showAiAnalysis, setShowAiAnalysis] = useState(true);
  const railwayAiWorkerUrl = String(process.env.NEXT_PUBLIC_RAILWAY_AI_WORKER_URL || "").replace(/\/$/, "");

  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
    setUser(currentUser);

    if (!currentUser) return;

    const allAlerts = JSON.parse(localStorage.getItem("priceAlerts") || "[]");
    const allAnalysis = JSON.parse(localStorage.getItem("analysisRequests") || "[]");

    setMyAlerts(allAlerts.filter((a) => a.userEmail === currentUser.email));
    setMyAnalysis(allAnalysis.filter((a) => a.userEmail === currentUser.email));
  }, []);

  const stats = useMemo(() => {
    const activeAlerts = myAlerts.filter((item) => item.status === "active").length;
    const triggeredAlerts = myAlerts.filter((item) => item.status === "triggered").length;
    const pendingAnalysis = myAnalysis.filter((item) => item.status !== "مكتمل").length;

    return { activeAlerts, triggeredAlerts, pendingAnalysis };
  }, [myAlerts, myAnalysis]);

  const deleteAlert = (id) => {
    if (!user) return;

    const allAlerts = JSON.parse(localStorage.getItem("priceAlerts") || "[]");
    const updated = allAlerts.filter((a) => a.id !== id);

    localStorage.setItem("priceAlerts", JSON.stringify(updated));
    setMyAlerts(updated.filter((a) => a.userEmail === user.email));
  };

  const analyzeCoinWithAI = async () => {
    const symbol = aiSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (!symbol) {
      setAiError("اكتب رمز العملة أولاً مثل BTCUSDT");
      return;
    }

    if (!railwayAiWorkerUrl) {
      setAiError("رابط سيرفر Railway غير مضاف داخل Vercel: NEXT_PUBLIC_RAILWAY_AI_WORKER_URL");
      return;
    }

    setAiLoading(true);
    setAiLoadingText("جاري التحليل اللحظي...");
    setAiError("");
    setAiResult(null);
    setShowAiAnalysis(true);

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await fetch(url, {
          ...options,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const normalizeResult = (raw) => {
      const data = raw?.result || raw || {};
      const trend = data.marketBias || data.trend || data.direction || "neutral";
      const confidence = data.confidence ? `\n\nنسبة الثقة: ${data.confidence}%` : "";
      const levels = [
        data.entry ? `الدخول المحتمل: ${Number(data.entry).toLocaleString()}` : "",
        data.stopLoss ? `وقف الخسارة: ${Number(data.stopLoss).toLocaleString()}` : "",
        data.target1 ? `الهدف الأول: ${Number(data.target1).toLocaleString()}` : "",
        data.target2 ? `الهدف الثاني: ${Number(data.target2).toLocaleString()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        ...data,
        symbol: data.symbol || symbol,
        marketBias: trend,
        bos: data.bos || (String(trend).toLowerCase().includes("bull") ? "Bullish BOS" : String(trend).toLowerCase().includes("bear") ? "Bearish BOS" : "بانتظار تأكيد"),
        choch: data.choch || "راقب تغير السلوك السعري",
        premiumZone: Boolean(data.premiumZone),
        currentPrice: data.currentPrice,
        chartImage: data.chartImage || null,
        chartData: Array.isArray(data.chartData) ? data.chartData : [],
        support: data.support || null,
        resistance: data.resistance || null,
        signals: Array.isArray(data.signals) ? data.signals : [],
        analysis:
          data.analysis ||
          [
            data.summary ? `الملخص: ${data.summary}` : "",
            data.smartMoney ? `SMC / ICT: ${data.smartMoney}` : "",
            data.classic ? `الكلاسيكي: ${data.classic}` : "",
            data.scenario ? `السيناريو المتوقع: ${data.scenario}` : "",
            levels,
            data.risk ? `إدارة المخاطر: ${data.risk}` : "",
          ]
            .filter(Boolean)
            .join("\n\n") + confidence,
      };
    };

    try {
      const response = await fetchWithTimeout(
        `${railwayAiWorkerUrl}/api/instant-analysis`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol,
            source: "my-dashboard",
            mode: "professional-smc-ict-classic",
            requestChart: true,
            schools: ["SMC", "ICT", "CLASSIC"],
          }),
        },
        20000
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `فشل إرسال طلب التحليل إلى Railway. كود الخطأ: ${response.status}`);
      }

      if (!data.jobId && data.result) {
        setAiResult(normalizeResult(data.result));
        setAiLoadingText("تم تجهيز التحليل بنجاح");
        return;
      }

      if (!data.jobId) {
        setAiResult(normalizeResult(data));
        setAiLoadingText("تم تجهيز التحليل بنجاح");
        return;
      }
      setAiLoadingText("جاري التحليل اللحظي...");

      for (let attempt = 1; attempt <= 45; attempt += 1) {
        await sleep(2000);
        setAiLoadingText("جاري التحليل اللحظي...");

        const statusResponse = await fetchWithTimeout(
          `${railwayAiWorkerUrl}/api/instant-analysis/${encodeURIComponent(data.jobId)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
          12000
        );

        const statusData = await statusResponse.json().catch(() => null);

        if (!statusResponse.ok || !statusData?.success) {
          throw new Error(statusData?.error || "تعذر قراءة نتيجة التحليل من Railway");
        }

        if (statusData.status === "completed" || statusData.result) {
          setAiResult(normalizeResult(statusData.result || statusData));
          setAiLoadingText("تم تجهيز التحليل بنجاح");
          return;
        }

        if (statusData.status === "failed") {
          throw new Error(statusData.error || "فشل توليد التحليل على السيرفر");
        }
      }

      setAiError("التحليل ما زال قيد المعالجة على السيرفر. جرّب مرة ثانية بعد قليل.");
    } catch (err) {
      if (err?.name === "AbortError") {
        setAiError("السيرفر تأخر بالرد، لكن الصفحة لم تعلق. جرّب مرة ثانية بعد لحظات.");
      } else {
        setAiError(err?.message || "حدث خطأ أثناء الاتصال بسيرفر Railway");
      }
    } finally {
      setAiLoading(false);
      setAiLoadingText("");
    }
  };

  if (!user) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />
        <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
          <div className="max-w-md rounded-[32px] border border-cyan-300/15 bg-white/[0.045] p-8 backdrop-blur-2xl">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/25 bg-cyan-400/10 text-4xl">🔐</div>
            <h1 className="text-3xl font-black">سجّل الدخول أولاً</h1>
            <p className="mt-3 leading-7 text-slate-400">ادخل إلى حسابك لعرض لوحة المستخدم والتنبيهات وطلبات التحليل.</p>
            <Link href="/login" className="mt-6 block rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white">
              الدخول للحساب
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 space-y-7 p-4 md:p-6">
        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-7 md:p-9 shadow-2xl backdrop-blur-2xl">
            <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
            <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-center">
              <div>
                <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200">
                  USER DASHBOARD
                </span>
                <h1 className="mt-5 text-4xl font-black leading-tight md:text-5xl">
                  مرحباً، {user.username || "متداول محترف"}
                </h1>
                <p className="mt-4 max-w-2xl leading-8 text-slate-300">
                  من هنا تتابع طلبات التحليل، التنبيهات السعرية، وردود الإدارة داخل لوحة واحدة منظمة واحترافية.
                </p>
              </div>

              <div className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-5 text-center shadow-[0_18px_50px_rgba(0,102,255,0.15)]">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-blue-600 to-cyan-300 text-2xl font-black shadow-[0_0_35px_rgba(0,163,255,0.35)]">
                  {(user.username || user.email || "HC").slice(0, 2).toUpperCase()}
                </div>
                <p className="mt-4 font-black">{user.username || "حسابي"}</p>
                <p className="mt-1 max-w-[220px] truncate text-sm text-slate-400">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
            <h2 className="text-xl font-black">حالة الحساب</h2>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
                <span className="text-slate-400">نوع الحساب</span>
                <span className="font-black text-cyan-200">{user.role === "admin" ? "إدارة" : "مستخدم"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
                <span className="text-slate-400">التليجرام</span>
                <span className="font-black text-cyan-200">{user.telegram || "غير مضاف"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
                <span className="text-slate-400">آخر دخول</span>
                <span className="font-black text-cyan-200">{user.loggedAt || "الآن"}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <StatCard title="طلبات التحليل" value={myAnalysis.length} subtitle="كل الطلبات المرسلة" icon="🧠" />
          <StatCard title="تنبيهات نشطة" value={stats.activeAlerts} subtitle="تنبيهات سعرية مفعّلة" icon="🔔" glow="green" />
          <StatCard title="طلبات قيد المتابعة" value={stats.pendingAnalysis} subtitle="بانتظار رد الإدارة" icon="⏳" glow="orange" />
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <QuickAction href="#instant-analysis" icon="📈" title="أطلب تحليل لحظي الآن" text="تحليل لحظي احترافي يعتمد على SMC و ICT." />
          <QuickAction href="/#alerts" icon="🔔" title="إنشاء تنبيه سعر" text="حدد العملة والسعر المطلوب للتنبيه." />
          <QuickAction href="/my-analysis" icon="📩" title="ردود الإدارة" text="تابع ردود الإدارة على طلباتك." />
        </section>

        <section id="instant-analysis" className="rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200">
                SMC / ICT LIVE ANALYSIS
              </span>
              <h2 className="mt-4 text-3xl font-black">تحليل العملات لحظياً</h2>
              <p className="mt-2 max-w-3xl leading-7 text-slate-400">
                تحليل لحظي احترافي يجمع بين SMC و ICT والمدرسة الكلاسيكية مع قراءة السيولة و BOS و CHOCH ومناطق العرض والطلب.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-xl">
              <input
                value={aiSymbol}
                onChange={(e) => setAiSymbol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") analyzeCoinWithAI();
                }}
                placeholder="مثال: BTCUSDT"
                className="min-h-14 flex-1 rounded-2xl border border-cyan-300/15 bg-black/30 px-5 font-black text-white outline-none placeholder:text-slate-500"
              />

              <button
                onClick={analyzeCoinWithAI}
                disabled={aiLoading}
                className="min-h-14 rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-7 font-black text-white shadow-[0_0_28px_rgba(37,99,235,0.28)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiLoading ? "جاري التحليل اللحظي" : "📈 أطلب تحليل لحظي الآن"}
              </button>
            </div>
            {aiLoadingText && (
              <div className="mt-4 flex items-center justify-center gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-5 py-4 text-center text-sm font-black leading-7 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.16)] lg:max-w-xl">
                <div className="h-9 w-9 shrink-0 animate-spin rounded-full border-4 border-cyan-200/40 border-t-cyan-300" />
                <span>جاري التحليل اللحظي</span>
              </div>
            )}
          </div>

          {aiError && (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
              {aiError}
            </div>
          )}

          {aiResult && (
            <div className="mt-6 rounded-[28px] border border-cyan-300/15 bg-black/20 p-6">
              <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-4 md:flex-row md:items-center">
                <div>
                  <p className="font-black text-white">إخفاء / إظهار التحليل</p>
                  <p className="mt-1 text-sm text-slate-400">يمكنك إخفاء التحليل من الشاشة وإظهاره بأي وقت.</p>
                </div>
                <button
                  onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                  className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 font-black text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  {showAiAnalysis ? "🙈 إخفاء التحليل" : "👁️ إظهار التحليل"}
                </button>
              </div>

              {showAiAnalysis && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-3xl font-black text-white">{aiResult.symbol}</h3>
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100">
                      {aiResult.marketBias}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-500">السعر الحالي</p>
                      <p className="mt-2 text-xl font-black text-white">
                        ${Number(aiResult.currentPrice || 0).toLocaleString()}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-500">BOS</p>
                      <p className="mt-2 text-lg font-black text-emerald-200">
                        {aiResult.bos}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-500">CHOCH</p>
                      <p className="mt-2 text-lg font-black text-cyan-200">
                        {aiResult.choch}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-500">Premium Zone</p>
                      <p className="mt-2 text-lg font-black text-white">
                        {aiResult.premiumZone ? "YES" : "NO"}
                      </p>
                    </div>
                  </div>

                  <RealCandlestickChart result={aiResult} />
                  <div className="mt-6 grid gap-6">
                    <div dir="rtl" className="whitespace-pre-line rounded-2xl border border-cyan-300/15 bg-white/95 p-6 text-right text-[15px] font-bold leading-9 text-slate-950 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.12)] dark:bg-cyan-400/5 dark:text-slate-100">
                      {aiResult.analysis}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">تنبيهاتي السعرية</h2>
                <p className="mt-1 text-sm text-slate-400">تنبيهاتك المفعّلة والمكتملة</p>
              </div>
              <Link href="/#alerts" className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-100">
                تنبيه جديد
              </Link>
            </div>

            {myAlerts.length > 0 ? (
              <div className="space-y-3">
                {myAlerts.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-black text-white">{item.coin}</h3>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="mt-2 text-sm text-slate-400">السعر المطلوب: ${item.targetPrice}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.createdAt}</p>
                        {item.triggeredAt && (
                          <p className="mt-2 text-sm text-emerald-300">
                            تم التفعيل عند: ${Number(item.triggeredPrice).toLocaleString()} — {item.triggeredAt}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => deleteAlert(item.id)}
                        className="rounded-2xl border border-red-400/20 bg-red-500/15 px-5 py-3 font-black text-red-100 transition hover:bg-red-500/25"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 p-8 text-center text-slate-400">
                لا توجد تنبيهات سعرية حتى الآن.
              </div>
            )}
          </div>

          <div className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">طلبات التحليل الخاصة بي</h2>
                <p className="mt-1 text-sm text-slate-400">أحدث الطلبات وردود الإدارة</p>
              </div>
              <Link href="/my-analysis" className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-100">
                عرض الكل
              </Link>
            </div>

            {myAnalysis.length > 0 ? (
              <div className="space-y-3">
                {myAnalysis.map((req) => (
                  <div key={req.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-black text-white">{req.coin}</h3>
                        <p className="mt-1 text-sm text-slate-400">الفريم: {req.frame}</p>
                        <p className="mt-1 text-xs text-slate-500">{req.createdAt}</p>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>

                    {req.reply && (
                      <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-4">
                        <p className="text-sm font-bold text-cyan-200">رد الإدارة</p>
                        <p className="mt-2 leading-7 text-slate-200">{req.reply}</p>
                        {req.replyImage && (
                          <img
                            src={req.replyImage}
                            className="mt-4 max-h-[420px] rounded-2xl border border-white/10 object-contain"
                            alt="صورة التحليل"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-black/20 p-8 text-center text-slate-400">
                لا توجد طلبات تحليل حتى الآن.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}