"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatNotificationTime } from "../../lib/notifications-shared";
import { useRequireAuth } from "../hooks/useRequireAuth";

function DashboardMetricCard({ title, value, subtitle, icon, tone = "blue" }) {
  return (
    <div className={`user-dashboard-metric user-dashboard-metric--${tone}`}>
      <div className="user-dashboard-metric__icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="user-dashboard-metric__title">{title}</p>
        <p className="user-dashboard-metric__value">{value}</p>
        <p className="user-dashboard-metric__subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function DashboardPanel({ title, subtitle, action, children }) {
  return (
    <section className="user-dashboard-panel">
      <div className="user-dashboard-panel__header">
        <div>
          <h2 className="user-dashboard-panel__title">{title}</h2>
          {subtitle ? <p className="user-dashboard-panel__subtitle">{subtitle}</p> : null}
        </div>
        {action || null}
      </div>
      <div className="user-dashboard-panel__body">{children}</div>
    </section>
  );
}

function DashboardEmptyState({ message, icon = "📭" }) {
  return (
    <div className="user-dashboard-empty">
      <span className="user-dashboard-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <p>{message}</p>
    </div>
  );
}

function QuickAction({ href, icon, title, text }) {
  return (
    <Link href={href} className="user-dashboard-action">
      <span className="user-dashboard-action__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3 className="user-dashboard-action__title">{title}</h3>
        <p className="user-dashboard-action__text">{text}</p>
      </div>
    </Link>
  );
}


function StatusBadge({ status }) {
  const isDone = status === "triggered" || status === "مكتمل";
  const label = status === "triggered" ? "تم الوصول" : status === "active" ? "نشط" : status || "غير محدد";

  return (
    <span className={`user-dashboard-badge ${isDone ? "user-dashboard-badge--done" : "user-dashboard-badge--active"}`}>
      {label}
    </span>
  );
}

function DashboardListItem({ title, meta, badge, children, actions }) {
  return (
    <article className="user-dashboard-list-item">
      <div className="user-dashboard-list-item__head">
        <div className="user-dashboard-list-item__main">
          <h3 className="user-dashboard-list-item__title">{title}</h3>
          {meta ? <p className="user-dashboard-list-item__meta">{meta}</p> : null}
        </div>
        {badge || null}
      </div>
      {children ? <div className="user-dashboard-list-item__body">{children}</div> : null}
      {actions ? <div className="user-dashboard-list-item__actions">{actions}</div> : null}
    </article>
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
  const maxRaw = Math.max(...highs, Number(result?.resistance || 0));
  const minRaw = Math.min(...lows, Number(result?.support || Infinity));
  const extra = Math.max((maxRaw - minRaw) * 0.14, Math.abs(maxRaw) * 0.002 || 1);
  const maxPrice = maxRaw + extra;
  const minPrice = minRaw - extra;
  const priceRange = Math.max(maxPrice - minPrice, Math.abs(maxPrice) * 0.01 || 1);
  const toY = (price) => padding.top + ((maxPrice - Number(price)) / priceRange) * chartHeight;
  const candleStep = chartWidth / Math.max(candles.length - 1, 1);
  const candleWidth = Math.max(5, Math.min(16, candleStep * 0.55));
  const direction = String(result?.direction || result?.trend || result?.marketBias || "neutral").toLowerCase();
  const isBearish = direction.includes("bear");
  const isBullish = direction.includes("bull");
  const biasText = isBullish ? "Bullish" : isBearish ? "Bearish" : "Neutral";

  const signals = Array.isArray(result?.signals) ? result.signals.slice(0, 4) : [];
  const currentPrice = Number(result?.currentPrice || candles[candles.length - 1]?.close || 0);
  const currentPriceY = Number.isFinite(currentPrice) ? toY(currentPrice) : null;

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
          {result?.symbol || "MARKET"} · Professional Market Structure
        </text>
        <text x="48" y="82" fill="#67e8f9" fontSize="16" fontWeight="800">
          Real OKX 15m candles · Liquidity · Support / Resistance · Structure
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

        {currentPriceY && (
          <g>
            <line x1={padding.left} y1={currentPriceY} x2={width - padding.right} y2={currentPriceY} stroke="#67e8f9" strokeWidth="2" strokeDasharray="6 8" strokeOpacity="0.75" />
            <rect x={width - padding.right - 170} y={currentPriceY - 16} width="165" height="32" rx="10" fill="#020817" stroke="#67e8f9" strokeOpacity="0.55" />
            <text x={width - padding.right - 156} y={currentPriceY + 5} fill="#67e8f9" fontSize="14" fontWeight="900">
              LIVE {currentPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </text>
          </g>
        )}

        <g>
          <rect x={padding.left + 14} y={padding.top + 14} width="380" height="128" rx="18" fill="#020817" fillOpacity="0.78" stroke="#22d3ee" strokeOpacity="0.22" />
          <text x={padding.left + 34} y={padding.top + 44} fill="#e2e8f0" fontSize="15" fontWeight="900">Market Structure Notes</text>
          {(signals.length ? signals : [result?.bos, result?.choch].filter(Boolean)).slice(0, 4).map((signal, index) => (
            <text key={`signal-${index}`} x={padding.left + 34} y={padding.top + 72 + index * 22} fill="#cbd5e1" fontSize="13" fontWeight="700">
              • {signal}
            </text>
          ))}
        </g>

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
          Real market candles · Structure zones from recent OHLC data · Educational only
        </text>
      </svg>
    </div>
  );
}

export default function MyDashboard() {
  const { user, sessionPending, shouldShowLogin, profileReady } = useRequireAuth();
  const [myAlerts, setMyAlerts] = useState([]);
  const [myAnalysis, setMyAnalysis] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [aiSymbol, setAiSymbol] = useState("BTCUSDT");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingText, setAiLoadingText] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [showAiAnalysis, setShowAiAnalysis] = useState(true);
  const railwayAiWorkerUrl = String(process.env.NEXT_PUBLIC_RAILWAY_AI_WORKER_URL || "").replace(/\/$/, "");

  useEffect(() => {
    if (sessionPending || shouldShowLogin || !user?.email) return;

    const allAlerts = JSON.parse(localStorage.getItem("priceAlerts") || "[]");
    const allAnalysis = JSON.parse(localStorage.getItem("analysisRequests") || "[]");

    setMyAlerts(allAlerts.filter((a) => a.userEmail === user.email));
    setMyAnalysis(allAnalysis.filter((a) => a.userEmail === user.email));
  }, [sessionPending, shouldShowLogin, user?.email]);

  useEffect(() => {
    if (sessionPending || shouldShowLogin || !user?.email) return undefined;

    let cancelled = false;
    setNotificationsLoading(true);

    fetch("/api/my-notifications?include_read=1&limit=5", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    })
      .then((response) => response.json().catch(() => null))
      .then((result) => {
        if (cancelled) return;
        if (result?.success && Array.isArray(result.notifications)) {
          setNotifications(result.notifications);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setNotificationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionPending, shouldShowLogin, user?.email, profileReady]);

  const stats = useMemo(() => {
    const activeAlerts = myAlerts.filter((item) => item.status === "active").length;
    const triggeredAlerts = myAlerts.filter((item) => item.status === "triggered").length;
    const pendingAnalysis = myAnalysis.filter((item) => item.status !== "مكتمل").length;

    return { activeAlerts, triggeredAlerts, pendingAnalysis };
  }, [myAlerts, myAnalysis]);

  const activeAlertsList = useMemo(
    () => myAlerts.filter((item) => item.status === "active"),
    [myAlerts]
  );

  const latestAnalysis = useMemo(() => myAnalysis.slice(0, 4), [myAnalysis]);

  const adminReplies = useMemo(
    () => myAnalysis.filter((item) => item.reply).slice(0, 4),
    [myAnalysis]
  );

  const subscriptionLabel = user?.subscription_plan || "لا يوجد اشتراك";
  const subscriptionStatus = user?.subscription_status || "غير مفعل";

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

  if (sessionPending) {
    return (
      <main className="user-dashboard-page user-dashboard-page--gate">
        <div className="user-dashboard-page__bg" aria-hidden="true" />
        <div className="user-dashboard-gate">
          <div className="user-dashboard-gate__icon" aria-hidden="true">⏳</div>
          <h1 className="user-dashboard-gate__title">جاري التحقق من الجلسة</h1>
          <p className="user-dashboard-gate__text">يرجى الانتظار حتى اكتمال فحص الجلسة...</p>
        </div>
      </main>
    );
  }

  if (shouldShowLogin) {
    return (
      <main className="user-dashboard-page user-dashboard-page--gate">
        <div className="user-dashboard-page__bg" aria-hidden="true" />
        <div className="user-dashboard-gate">
          <div className="user-dashboard-gate__icon" aria-hidden="true">🔐</div>
          <h1 className="user-dashboard-gate__title">سجّل الدخول أولاً</h1>
          <p className="user-dashboard-gate__text">ادخل إلى حسابك لعرض لوحة المستخدم والتنبيهات وطلبات التحليل.</p>
          <Link href="/login" className="user-dashboard-gate__btn">
            الدخول للحساب
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="user-dashboard-page">
      <div className="user-dashboard-page__bg" aria-hidden="true" />

      <div className="user-dashboard-page__inner">
        <header className="user-dashboard-hero">
          <div className="user-dashboard-hero__content">
            <span className="user-dashboard-hero__eyebrow">لوحة المستخدم</span>
            <h1 className="user-dashboard-hero__title">مرحباً، {user.username || "متداول محترف"}</h1>
            <p className="user-dashboard-hero__text">
              من هنا تتابع طلبات التحليل، التنبيهات السعرية، وردود الإدارة داخل لوحة واحدة منظمة.
            </p>
            <div className="user-dashboard-hero__stats">
              <div className="user-dashboard-hero__stat">
                <span className="user-dashboard-hero__stat-value">{myAnalysis.length}</span>
                <span className="user-dashboard-hero__stat-label">طلبات التحليل</span>
              </div>
              <div className="user-dashboard-hero__stat">
                <span className="user-dashboard-hero__stat-value">{stats.activeAlerts}</span>
                <span className="user-dashboard-hero__stat-label">تنبيهات نشطة</span>
              </div>
              <div className="user-dashboard-hero__stat">
                <span className="user-dashboard-hero__stat-value">{stats.pendingAnalysis}</span>
                <span className="user-dashboard-hero__stat-label">قيد المتابعة</span>
              </div>
            </div>
          </div>

          <div className="user-dashboard-hero__profile">
            <div className="user-dashboard-hero__avatar" aria-hidden="true">
              {(user.username || user.email || "HC").slice(0, 2).toUpperCase()}
            </div>
            <p className="user-dashboard-hero__name">{user.username || "حسابي"}</p>
            <p className="user-dashboard-hero__email">{user.email}</p>
          </div>
        </header>

        <section className="user-dashboard-metrics" aria-label="ملخص سريع">
          <DashboardMetricCard
            title="حالة الحساب"
            value={user.role === "admin" ? "إدارة" : "نشط"}
            subtitle={user.loggedAt ? `آخر دخول: ${user.loggedAt}` : "مسجل الدخول الآن"}
            icon="👤"
            tone="blue"
          />
          <DashboardMetricCard
            title="نوع الاشتراك"
            value={subscriptionLabel}
            subtitle={`الحالة: ${subscriptionStatus}`}
            icon="⭐"
            tone="green"
          />
          <DashboardMetricCard
            title="تنبيهات نشطة"
            value={stats.activeAlerts}
            subtitle={`${stats.triggeredAlerts} تنبيه مكتمل`}
            icon="🔔"
            tone="cyan"
          />
          <DashboardMetricCard
            title="طلبات التحليل"
            value={myAnalysis.length}
            subtitle={`${stats.pendingAnalysis} بانتظار الرد`}
            icon="🧠"
            tone="orange"
          />
        </section>

        <section className="user-dashboard-actions" aria-label="إجراءات سريعة">
          <QuickAction href="#instant-analysis" icon="📈" title="تحليل لحظي" text="SMC و ICT لحظياً" />
          <QuickAction href="/#alerts" icon="🔔" title="تنبيه سعر" text="حدد العملة والسعر المطلوب" />
          <QuickAction href="/my-analysis" icon="📩" title="ردود الإدارة" text="تابع ردود الإدارة على طلباتك" />
          <QuickAction href="/notifications" icon="🔔" title="الإشعارات" text="عرض كل الإشعارات" />
          <QuickAction
            href="/notification-sound-settings"
            icon="🔊"
            title="صوت الإشعارات"
            text="تحكم بأصوات التنبيهات"
          />
        </section>

        <section className="user-dashboard-grid">
          <DashboardPanel
            title="حالة الحساب"
            subtitle="معلومات حسابك الأساسية"
          >
            <div className="user-dashboard-info-rows">
              <div className="user-dashboard-info-row">
                <span>نوع الحساب</span>
                <strong>{user.role === "admin" ? "إدارة" : "مستخدم"}</strong>
              </div>
              <div className="user-dashboard-info-row">
                <span>التليجرام</span>
                <strong>{user.telegram || "غير مضاف"}</strong>
              </div>
              <div className="user-dashboard-info-row">
                <span>آخر دخول</span>
                <strong>{user.loggedAt || "الآن"}</strong>
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="نوع الاشتراك"
            subtitle="تفاصيل خطتك الحالية"
          >
            <div className="user-dashboard-info-rows">
              <div className="user-dashboard-info-row">
                <span>الخطة</span>
                <strong>{subscriptionLabel}</strong>
              </div>
              <div className="user-dashboard-info-row">
                <span>الحالة</span>
                <strong>{subscriptionStatus}</strong>
              </div>
              <div className="user-dashboard-info-row">
                <span>البريد</span>
                <strong className="user-dashboard-info-row__truncate">{user.email}</strong>
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="آخر طلبات التحليل"
            subtitle="أحدث الطلبات المرسلة"
            action={
              <Link href="/my-analysis" className="user-dashboard-panel__link">
                عرض الكل
              </Link>
            }
          >
            {latestAnalysis.length > 0 ? (
              <div className="user-dashboard-list">
                {latestAnalysis.map((req) => (
                  <DashboardListItem
                    key={req.id}
                    title={req.coin}
                    meta={`${req.frame || "—"} · ${req.createdAt || ""}`}
                    badge={<StatusBadge status={req.status} />}
                  />
                ))}
              </div>
            ) : (
              <DashboardEmptyState message="لا توجد طلبات حالياً" icon="📭" />
            )}
          </DashboardPanel>

          <DashboardPanel
            title="التنبيهات النشطة"
            subtitle="تنبيهاتك السعرية المفعّلة"
            action={
              <Link href="/#alerts" className="user-dashboard-panel__link">
                تنبيه جديد
              </Link>
            }
          >
            {activeAlertsList.length > 0 ? (
              <div className="user-dashboard-list">
                {activeAlertsList.map((item) => (
                  <DashboardListItem
                    key={item.id}
                    title={item.coin}
                    meta={`السعر المطلوب: $${item.targetPrice} · ${item.createdAt || ""}`}
                    badge={<StatusBadge status={item.status} />}
                    actions={
                      <button
                        type="button"
                        onClick={() => deleteAlert(item.id)}
                        className="user-dashboard-btn user-dashboard-btn--danger"
                      >
                        حذف
                      </button>
                    }
                  />
                ))}
              </div>
            ) : (
              <DashboardEmptyState message="لا توجد تنبيهات نشطة" icon="🔕" />
            )}
          </DashboardPanel>

          <DashboardPanel
            title="رسائل الإدارة / الردود"
            subtitle="آخر ردود الإدارة على طلباتك"
            action={
              <Link href="/my-analysis" className="user-dashboard-panel__link">
                عرض الكل
              </Link>
            }
          >
            {adminReplies.length > 0 ? (
              <div className="user-dashboard-list">
                {adminReplies.map((req) => (
                  <DashboardListItem
                    key={`reply-${req.id}`}
                    title={req.coin}
                    meta={req.createdAt || ""}
                    badge={<StatusBadge status={req.status} />}
                  >
                    <p className="user-dashboard-reply">{req.reply}</p>
                  </DashboardListItem>
                ))}
              </div>
            ) : (
              <DashboardEmptyState message="لا توجد ردود من الإدارة حالياً" icon="💬" />
            )}
          </DashboardPanel>

          <DashboardPanel
            title="آخر الإشعارات"
            subtitle="أحدث التحديثات على حسابك"
            action={
              <Link href="/notifications" className="user-dashboard-panel__link">
                عرض الكل
              </Link>
            }
          >
            {notificationsLoading ? (
              <div className="user-dashboard-loading">جاري تحميل الإشعارات...</div>
            ) : notifications.length > 0 ? (
              <div className="user-dashboard-list">
                {notifications.map((notification) => (
                  <DashboardListItem
                    key={notification.id}
                    title={notification.title}
                    meta={formatNotificationTime(notification.createdAt)}
                    badge={
                      !notification.isRead ? (
                        <span className="user-dashboard-badge user-dashboard-badge--new">جديد</span>
                      ) : null
                    }
                  >
                    {notification.message ? (
                      <p className="user-dashboard-notification-msg">{notification.message}</p>
                    ) : null}
                  </DashboardListItem>
                ))}
              </div>
            ) : (
              <DashboardEmptyState message="لا توجد إشعارات حالياً" icon="🔔" />
            )}
          </DashboardPanel>
        </section>

        <section id="instant-analysis" className="user-dashboard-ai">
          <div className="user-dashboard-ai__header">
            <div>
              <span className="user-dashboard-ai__eyebrow">SMC / ICT LIVE ANALYSIS</span>
              <h2 className="user-dashboard-ai__title">تحليل العملات لحظياً</h2>
              <p className="user-dashboard-ai__text">
                تحليل لحظي احترافي يجمع بين SMC و ICT والمدرسة الكلاسيكية مع قراءة السيولة و BOS و CHOCH.
              </p>
            </div>

            <div className="user-dashboard-ai__form">
              <input
                value={aiSymbol}
                onChange={(e) => setAiSymbol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") analyzeCoinWithAI();
                }}
                placeholder="مثال: BTCUSDT"
                className="user-dashboard-ai__input"
              />
              <button
                type="button"
                onClick={analyzeCoinWithAI}
                disabled={aiLoading}
                className="user-dashboard-ai__submit"
              >
                {aiLoading ? "جاري التحليل..." : "📈 تحليل لحظي"}
              </button>
            </div>
          </div>

          {aiLoadingText ? (
            <div className="user-dashboard-ai__loading">
              <div className="user-dashboard-ai__spinner" aria-hidden="true" />
              <span>{aiLoadingText}</span>
            </div>
          ) : null}

          {aiError ? (
            <div className="user-dashboard-ai__error">{aiError}</div>
          ) : null}

          {aiResult ? (
            <div className="user-dashboard-ai__result">
              <div className="user-dashboard-ai__toggle-row">
                <div>
                  <p className="user-dashboard-ai__toggle-title">إخفاء / إظهار التحليل</p>
                  <p className="user-dashboard-ai__toggle-text">يمكنك إخفاء التحليل من الشاشة وإظهاره بأي وقت.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                  className="user-dashboard-btn user-dashboard-btn--ghost"
                >
                  {showAiAnalysis ? "🙈 إخفاء" : "👁️ إظهار"}
                </button>
              </div>

              {showAiAnalysis ? (
                <>
                  <div className="user-dashboard-ai__result-head">
                    <h3 className="user-dashboard-ai__symbol">{aiResult.symbol}</h3>
                    <span className="user-dashboard-badge user-dashboard-badge--active">{aiResult.marketBias}</span>
                  </div>

                  <div className="user-dashboard-ai__result-grid">
                    <div className="user-dashboard-ai__result-card">
                      <p className="user-dashboard-ai__result-label">السعر الحالي</p>
                      <p className="user-dashboard-ai__result-value">
                        ${Number(aiResult.currentPrice || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="user-dashboard-ai__result-card">
                      <p className="user-dashboard-ai__result-label">BOS</p>
                      <p className="user-dashboard-ai__result-value user-dashboard-ai__result-value--sm">{aiResult.bos}</p>
                    </div>
                    <div className="user-dashboard-ai__result-card">
                      <p className="user-dashboard-ai__result-label">CHOCH</p>
                      <p className="user-dashboard-ai__result-value user-dashboard-ai__result-value--sm">{aiResult.choch}</p>
                    </div>
                    <div className="user-dashboard-ai__result-card">
                      <p className="user-dashboard-ai__result-label">Premium Zone</p>
                      <p className="user-dashboard-ai__result-value user-dashboard-ai__result-value--sm">
                        {aiResult.premiumZone ? "YES" : "NO"}
                      </p>
                    </div>
                  </div>

                  <RealCandlestickChart result={aiResult} />

                  <div dir="rtl" className="user-dashboard-ai__analysis-text">
                    {aiResult.analysis}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}