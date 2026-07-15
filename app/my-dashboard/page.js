"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatNotificationTime } from "../../lib/notifications-shared";
import { useRequireAuth } from "../hooks/useRequireAuth";

const RealCandlestickChart = dynamic(() => import("./RealCandlestickChart"), {
  ssr: false,
  loading: () => null,
});

let dashboardBootstrapInflight = null;

async function fetchDashboardBootstrap(signal) {
  if (dashboardBootstrapInflight) {
    return dashboardBootstrapInflight;
  }

  const request = Promise.all([
    fetch("/api/alerts?summary=1", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    }),
    fetch("/api/my-notifications?include_read=1&limit=5", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    }),
  ]).finally(() => {
    dashboardBootstrapInflight = null;
  });

  dashboardBootstrapInflight = request;
  return request;
}

function StatusBadge({ status, variant = "dashboard" }) {
  if (variant !== "dashboard") {
    return <span className="user-dashboard-badge">{status || "غير محدد"}</span>;
  }

  const isDone = status === "triggered" || status === "مكتمل";
  const isActive = status === "active";
  const label =
    status === "triggered"
      ? "تم الوصول"
      : status === "active"
      ? "نشط"
      : status === "مكتمل"
      ? "مكتمل"
      : status || "غير محدد";

  const badgeClass = isDone
    ? "user-dashboard-badge--done"
    : isActive
    ? "user-dashboard-badge--active"
    : "user-dashboard-badge--new";

  return <span className={`user-dashboard-badge ${badgeClass}`}>{label}</span>;
}

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

export default function MyDashboard() {
  const { user, sessionPending, shouldShowLogin } = useRequireAuth();
  const [alertCounts, setAlertCounts] = useState({ active: 0, triggered: 0, cancelled: 0 });
  const [myAnalysis, setMyAnalysis] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [aiSymbol, setAiSymbol] = useState("BTCUSDT");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingText, setAiLoadingText] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [showAiAnalysis, setShowAiAnalysis] = useState(true);
  const aiAbortRef = useRef(null);
  const railwayAiWorkerUrl = String(process.env.NEXT_PUBLIC_RAILWAY_AI_WORKER_URL || "").replace(/\/$/, "");

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (sessionPending || shouldShowLogin || !user?.email) return;

    const allAnalysis = JSON.parse(localStorage.getItem("analysisRequests") || "[]");
    setMyAnalysis(allAnalysis.filter((a) => a.userEmail === user.email));
  }, [sessionPending, shouldShowLogin, user?.email]);

  useEffect(() => {
    if (sessionPending || shouldShowLogin || !user?.email) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    setNotificationsLoading(true);

    void fetchDashboardBootstrap(controller.signal)
      .then(async ([alertsResponse, notificationsResponse]) => {
        if (cancelled) return;

        const [alertsResult, notificationsResult] = await Promise.all([
          alertsResponse.json().catch(() => null),
          notificationsResponse.json().catch(() => null),
        ]);

        if (cancelled) return;

        if (alertsResult?.success && alertsResult.counts) {
          setAlertCounts({
            active: Number(alertsResult.counts.active) || 0,
            triggered: Number(alertsResult.counts.triggered) || 0,
            cancelled: Number(alertsResult.counts.cancelled) || 0,
          });
        } else {
          setAlertCounts({ active: 0, triggered: 0, cancelled: 0 });
        }

        if (notificationsResult?.success && Array.isArray(notificationsResult.notifications)) {
          setNotifications(notificationsResult.notifications);
        }
      })
      .catch((error) => {
        if (cancelled || error?.name === "AbortError") return;
        setAlertCounts({ active: 0, triggered: 0, cancelled: 0 });
      })
      .finally(() => {
        if (!cancelled) setNotificationsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionPending, shouldShowLogin, user?.email]);

  const stats = useMemo(() => {
    const activeAlerts = alertCounts.active;
    const triggeredAlerts = alertCounts.triggered;
    const cancelledAlerts = alertCounts.cancelled;
    const pendingAnalysis = myAnalysis.filter((item) => item.status !== "مكتمل").length;

    return { activeAlerts, triggeredAlerts, cancelledAlerts, pendingAnalysis };
  }, [alertCounts, myAnalysis]);

  const latestAnalysis = useMemo(() => myAnalysis.slice(0, 4), [myAnalysis]);

  const adminReplies = useMemo(
    () => myAnalysis.filter((item) => item.reply).slice(0, 4),
    [myAnalysis]
  );

  const subscriptionLabel = user?.subscription_plan || "لا يوجد اشتراك";
  const subscriptionStatus = user?.subscription_status || "غير مفعل";

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

    aiAbortRef.current?.abort();
    const analysisController = new AbortController();
    aiAbortRef.current = analysisController;

    setAiLoading(true);
    setAiLoadingText("جاري التحليل اللحظي...");
    setAiError("");
    setAiResult(null);
    setShowAiAnalysis(true);

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
      const abortFetch = () => timeoutController.abort();

      analysisController.signal.addEventListener("abort", abortFetch, { once: true });

      try {
        return await fetch(url, {
          ...options,
          signal: timeoutController.signal,
        });
      } finally {
        clearTimeout(timeoutId);
        analysisController.signal.removeEventListener("abort", abortFetch);
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
        if (analysisController.signal.aborted) {
          return;
        }

        await sleep(2000);

        if (analysisController.signal.aborted) {
          return;
        }

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
      if (analysisController.signal.aborted) {
        return;
      }

      if (err?.name === "AbortError") {
        setAiError("السيرفر تأخر بالرد، لكن الصفحة لم تعلق. جرّب مرة ثانية بعد لحظات.");
      } else {
        setAiError(err?.message || "حدث خطأ أثناء الاتصال بسيرفر Railway");
      }
    } finally {
      if (!analysisController.signal.aborted) {
        setAiLoading(false);
        setAiLoadingText("");
      }
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
          <QuickAction href="/alerts?tab=create" icon="🔔" title="تنبيه سعر" text="حدد العملة والسعر المطلوب" />
          <QuickAction href="/my-analysis" icon="📩" title="ردود الإدارة" text="تابع ردود الإدارة على طلباتك" />
          <QuickAction href="/notifications" icon="🔔" title="الإشعارات" text="عرض كل الإشعارات" />
          <QuickAction
            href="/notification-settings"
            icon="🔊"
            title="إعدادات الإشعارات"
            text="تحكم في الإشعارات والصوت والبريد"
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
                    badge={<StatusBadge status={req.status} variant="dashboard" />}
                  />
                ))}
              </div>
            ) : (
              <DashboardEmptyState message="لا توجد طلبات حالياً" icon="📭" />
            )}
          </DashboardPanel>

          <section className="user-dashboard-panel">
            <div className="user-dashboard-panel__header">
              <div>
                <h2 className="user-dashboard-panel__title">إدارة التنبيهات</h2>
                <p className="user-dashboard-panel__subtitle">متابعة التنبيهات قيد الانتظار والمنفذة والملغاة</p>
              </div>
            </div>
            <div className="user-dashboard-panel__body">
              <div className="user-dashboard-info-rows">
                <div className="user-dashboard-info-row">
                  <span>قيد الانتظار</span>
                  <strong>{stats.activeAlerts}</strong>
                </div>
                <div className="user-dashboard-info-row">
                  <span>تم التنفيذ</span>
                  <strong>{stats.triggeredAlerts}</strong>
                </div>
                <div className="user-dashboard-info-row">
                  <span>ملغاة</span>
                  <strong>{stats.cancelledAlerts}</strong>
                </div>
              </div>
              <div className="user-dashboard-panel__footer">
                <Link href="/my-dashboard/alerts" className="user-dashboard-btn user-dashboard-btn--ghost">
                  عرض جميع التنبيهات
                </Link>
              </div>
            </div>
          </section>

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
                    badge={<StatusBadge status={req.status} variant="dashboard" />}
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