"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deletePriceAlert } from "../../../lib/price-alert-create-client";
import {
  formatPriceAlertCondition,
  formatPriceAlertDateTime,
  formatPriceAlertStatus,
  PRICE_ALERT_STATUS,
  PRICE_ALERT_TAB_LIMITS,
} from "../../../lib/price-alert-shared";
import AppModal from "../../components/AppModal";
import { useRequireAuth } from "../../hooks/useRequireAuth";

const TABS = [
  { id: PRICE_ALERT_STATUS.ACTIVE, label: "قيد الانتظار" },
  { id: PRICE_ALERT_STATUS.TRIGGERED, label: "تم التنفيذ" },
  { id: PRICE_ALERT_STATUS.CANCELLED, label: "ملغاة" },
];

function AlertStatusBadge({ status }) {
  const isDone = status === PRICE_ALERT_STATUS.TRIGGERED;
  const isActive = status === PRICE_ALERT_STATUS.ACTIVE;
  const badgeClass = isDone
    ? "user-dashboard-badge--done"
    : isActive
    ? "user-dashboard-badge--active"
    : "user-dashboard-badge--new";

  return (
    <span className={`user-dashboard-badge ${badgeClass}`}>
      {formatPriceAlertStatus(status)}
    </span>
  );
}

function AlertListSkeleton() {
  return (
    <div className="user-dashboard-list" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="user-dashboard-list-item user-dashboard-list-item--skeleton">
          <div className="user-dashboard-skeleton-line user-dashboard-skeleton-line--title" />
          <div className="user-dashboard-skeleton-line user-dashboard-skeleton-line--meta" />
          <div className="user-dashboard-skeleton-line user-dashboard-skeleton-line--meta" />
        </div>
      ))}
    </div>
  );
}

function AlertListItem({ alert, showDelete, onDeleteRequest, deleteLoading }) {
  return (
    <article className="user-dashboard-list-item">
      <div className="user-dashboard-list-item__head">
        <div className="user-dashboard-list-item__main">
          <h3 className="user-dashboard-list-item__title">{alert.coin}</h3>
          <p className="user-dashboard-list-item__meta">
            السعر المستهدف: ${alert.price} · نوع التنبيه: {formatPriceAlertCondition(alert.condition)}
          </p>
        </div>
        <AlertStatusBadge status={alert.status} />
      </div>

      <div className="user-dashboard-list-item__body">
        <div className="user-dashboard-info-rows">
          <div className="user-dashboard-info-row">
            <span>تاريخ الإنشاء</span>
            <strong>{formatPriceAlertDateTime(alert.createdAt)}</strong>
          </div>
          {alert.status === PRICE_ALERT_STATUS.TRIGGERED ? (
            <>
              <div className="user-dashboard-info-row">
                <span>سعر التنفيذ</span>
                <strong>${alert.triggeredPrice || "—"}</strong>
              </div>
              <div className="user-dashboard-info-row">
                <span>وقت التنفيذ</span>
                <strong>{formatPriceAlertDateTime(alert.triggeredAt)}</strong>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {showDelete ? (
        <div className="user-dashboard-list-item__actions">
          <button
            type="button"
            onClick={() => onDeleteRequest(alert.id)}
            disabled={deleteLoading}
            className="user-dashboard-btn user-dashboard-btn--danger"
          >
            {deleteLoading ? "جاري الحذف..." : "حذف"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function MyDashboardAlertsPage() {
  const { user, sessionPending, shouldShowLogin } = useRequireAuth();
  const [activeTab, setActiveTab] = useState(PRICE_ALERT_STATUS.ACTIVE);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [error, setError] = useState("");

  const tabLimit = PRICE_ALERT_TAB_LIMITS[activeTab] || 15;

  const loadAlerts = useCallback(
    async (signal) => {
      if (sessionPending || shouldShowLogin || !user?.email) {
        setAlerts([]);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/alerts?status=${encodeURIComponent(activeTab)}&limit=${tabLimit}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            signal,
          }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "تعذر تحميل التنبيهات.");
        }

        setAlerts(Array.isArray(result.alerts) ? result.alerts : []);
      } catch (err) {
        if (err?.name === "AbortError") return;
        setAlerts([]);
        setError(err?.message || "حدث خطأ أثناء تحميل التنبيهات.");
      } finally {
        setLoading(false);
      }
    },
    [activeTab, sessionPending, shouldShowLogin, tabLimit, user?.email]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAlerts(controller.signal);
    return () => controller.abort();
  }, [loadAlerts]);

  const emptyMessage = useMemo(() => {
    if (activeTab === PRICE_ALERT_STATUS.ACTIVE) {
      return "لا توجد تنبيهات معلقة حالياً";
    }
    if (activeTab === PRICE_ALERT_STATUS.TRIGGERED) {
      return "لا توجد تنبيهات منفذة بعد";
    }
    return "لا توجد تنبيهات ملغاة حالياً";
  }, [activeTab]);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId || deletingId) return;

    setDeletingId(pendingDeleteId);

    try {
      await deletePriceAlert({ id: pendingDeleteId });
      setAlerts((current) => current.filter((item) => item.id !== pendingDeleteId));
      setPendingDeleteId(null);
    } catch (err) {
      setError(err?.message || "تعذر حذف التنبيه.");
    } finally {
      setDeletingId(null);
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
          <p className="user-dashboard-gate__text">ادخل إلى حسابك لإدارة التنبيهات السعرية.</p>
          <Link href="/login" className="user-dashboard-gate__btn">
            الدخول للحساب
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="user-dashboard-page">
      <AppModal
        open={Boolean(pendingDeleteId)}
        type="warning"
        title="حذف التنبيه"
        message="هل أنت متأكد من حذف هذا التنبيه؟ سيتم نقله إلى تبويب الملغاة."
        mode="confirm"
        confirmText={deletingId ? "جاري الحذف..." : "حذف"}
        cancelText="إلغاء"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deletingId) setPendingDeleteId(null);
        }}
        onClose={() => {
          if (!deletingId) setPendingDeleteId(null);
        }}
      />

      <div className="user-dashboard-page__bg" aria-hidden="true" />

      <div className="user-dashboard-page__inner">
        <header className="user-dashboard-hero">
          <div className="user-dashboard-hero__content">
            <span className="user-dashboard-hero__eyebrow">لوحة المستخدم</span>
            <h1 className="user-dashboard-hero__title">إدارة التنبيهات</h1>
            <p className="user-dashboard-hero__text">
              تابع تنبيهات السعر حسب حالتها مع تفاصيل السعر المستهدف ووقت التنفيذ.
            </p>
          </div>
        </header>

        <section className="user-dashboard-panel">
          <div className="user-dashboard-panel__header">
            <div>
              <h2 className="user-dashboard-panel__title">تبويبات التنبيهات</h2>
              <p className="user-dashboard-panel__subtitle">آخر {tabLimit} تنبيه في التبويب المحدد</p>
            </div>
            <Link href="/my-dashboard" className="user-dashboard-panel__link">
              العودة للوحة
            </Link>
          </div>

          <div className="user-dashboard-panel__body">
            <div className="user-dashboard-tabs" role="tablist" aria-label="تبويبات التنبيهات">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`user-dashboard-tabs__btn ${
                    activeTab === tab.id ? "user-dashboard-tabs__btn--active" : ""
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {error ? (
              <div className="user-dashboard-error">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void loadAlerts()}
                  className="user-dashboard-btn user-dashboard-btn--ghost"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : null}

            {loading ? (
              <AlertListSkeleton />
            ) : !error && alerts.length > 0 ? (
              <div className="user-dashboard-list">
                {alerts.map((alert) => (
                  <AlertListItem
                    key={alert.id}
                    alert={alert}
                    showDelete={activeTab === PRICE_ALERT_STATUS.ACTIVE}
                    onDeleteRequest={setPendingDeleteId}
                    deleteLoading={deletingId === alert.id}
                  />
                ))}
              </div>
            ) : !error ? (
              <div className="user-dashboard-empty">
                <span className="user-dashboard-empty__icon" aria-hidden="true">🔔</span>
                <p>{emptyMessage}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
