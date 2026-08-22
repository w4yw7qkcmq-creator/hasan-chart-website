"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatNotificationTime } from "../../../lib/notifications-shared";
import { useRequireAuth } from "../../hooks/useRequireAuth";
import UserAccountUuidRow from "./UserAccountUuidRow";

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

function DashboardMetricCard({ title, value, subtitle, icon, tone = "blue", href }) {
  const content = (
    <>
      <div className="user-dashboard-metric__icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="user-dashboard-metric__title">{title}</p>
        <p className="user-dashboard-metric__value">{value}</p>
        <p className="user-dashboard-metric__subtitle">{subtitle}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`user-dashboard-metric user-dashboard-metric--${tone} user-dashboard-metric--clickable`}
        aria-label={`${title} - عرض جميع التنبيهات`}
      >
        {content}
      </Link>
    );
  }

  return <div className={`user-dashboard-metric user-dashboard-metric--${tone}`}>{content}</div>;
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
            href="/my-dashboard/alerts"
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
              <UserAccountUuidRow userId={user.id} />
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

          <Link href="/my-dashboard/alerts" className="user-dashboard-panel user-dashboard-panel--clickable">
            <div className="user-dashboard-panel__header">
              <div>
                <h2 className="user-dashboard-panel__title">إدارة التنبيهات</h2>
                <p className="user-dashboard-panel__subtitle">متابعة التنبيهات قيد الانتظار والمنفذة والملغاة</p>
              </div>
              <span className="user-dashboard-panel__link">فتح</span>
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
            </div>
          </Link>

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
      </div>
    </main>
  );
}