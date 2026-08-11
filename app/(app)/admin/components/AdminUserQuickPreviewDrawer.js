"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../../lib/admin-fetch";
import { fetchAdminUserSection } from "../../../../lib/admin-user-management-client";
import { sanitizeAdminUserFacingError } from "../../../../lib/admin-user-management-shared";
import {
  buildClassificationBanner,
  getUserClassificationLabel,
} from "../../../../lib/user-classification";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar");
}

function AccountStatusBadge({ status, label }) {
  const tone =
    status === "banned"
      ? "admin-user-status--banned"
      : status === "suspended"
      ? "admin-user-status--suspended"
      : status === "deleted"
      ? "admin-user-status--deleted"
      : "admin-user-status--active";

  return <span className={`admin-user-status ${tone}`}>{label}</span>;
}

function PreviewSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-5">
      <div className="h-16 rounded-2xl bg-slate-200/40" />
      <div className="h-20 rounded-2xl bg-slate-200/40" />
      <div className="h-24 rounded-2xl bg-slate-200/40" />
    </div>
  );
}

function UuidCopy({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span>—</span>;

  return (
    <span className="crm-uuid-copy">
      <span>{String(value).slice(0, 8)}…</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(String(value)).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "✓" : "نسخ"}
      </button>
    </span>
  );
}

export default function AdminUserQuickPreviewDrawer({ open, userId, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [activity, setActivity] = useState(null);
  const abortRef = useRef(null);
  const previousOverflowRef = useRef("");
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    }
  }, [open]);

  const loadPreview = useCallback(async () => {
    if (!userId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const [overviewResult, activityResult] = await Promise.all([
        fetchAdminUserSection(adminFetch, userId, "overview", { signal: controller.signal }),
        fetchAdminUserSection(adminFetch, userId, "activity", {
          signal: controller.signal,
          page: 1,
          activityFilter: "all",
        }).catch(() => null),
      ]);

      if (controller.signal.aborted) return;
      setOverview(overviewResult);
      setActivity(activityResult);
    } catch (loadError) {
      if (loadError?.name === "AbortError") return;
      const sanitized = sanitizeAdminUserFacingError(loadError);
      setError(sanitized.message);
      setOverview(null);
      setActivity(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return undefined;

    setOverview(null);
    setActivity(null);
    void loadPreview();

    return () => abortRef.current?.abort();
  }, [loadPreview, open, userId]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
      }
    };

    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => drawerRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflowRef.current;
      window.removeEventListener("keydown", onKeyDown);
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!mounted || !open || !userId) return null;

  const user = overview?.user;
  const stats = overview?.stats;
  const services = overview?.servicesPreview || overview?.activeServices || [];
  const recentEvents = (activity?.events || []).slice(0, 3);
  const classificationBanner = buildClassificationBanner(user?.userClassification);
  const activeSubscription =
    overview?.primarySubscription ||
    (overview?.subscriptions || []).find((item) => item?.isActive) ||
    null;

  return createPortal(
    <div className="admin-user-preview-overlay" role="presentation">
      <button type="button" className="admin-user-preview-overlay__backdrop" onClick={onClose} aria-label="إغلاق" />
      <aside
        ref={drawerRef}
        tabIndex={-1}
        className="admin-user-drawer admin-user-drawer--preview"
        aria-label="معاينة سريعة للمستخدم"
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-user-drawer__header admin-user-drawer__header--sticky">
          <div>
            <p className="admin-user-hero__eyebrow">معاينة سريعة</p>
            <h3 className="admin-heading text-lg">{user?.username || user?.email || "المستخدم"}</h3>
          </div>
          <button type="button" className="admin-user-drawer__close admin-user-drawer__close--fixed" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>

        <div className="admin-user-drawer__body admin-user-drawer__body--preview">
          {loading ? <PreviewSkeleton /> : null}

          {!loading && error ? (
            <div className="admin-user-section-state admin-user-section-state--error p-5">
              <p className="admin-user-section-state__title">{error}</p>
              <button type="button" className="admin-btn-surface mt-4 px-5 py-3" onClick={() => void loadPreview()}>
                إعادة المحاولة
              </button>
            </div>
          ) : null}

          {!loading && !error && user ? (
            <div className="space-y-4 p-5">
              {classificationBanner ? (
                <p className="crm-classification-banner" role="status">
                  {classificationBanner}
                </p>
              ) : null}

              <div className="admin-user-preview-card">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="admin-heading text-lg">{user.username || "—"}</h4>
                  <AccountStatusBadge status={user.accountStatus} label={user.accountStatusLabel} />
                  {user.userClassification ? (
                    <span className={`au-classification-badge au-classification-badge--${user.userClassification}`}>
                      {user.userClassificationLabel ||
                        getUserClassificationLabel(user.userClassification, { short: true })}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">{user.email || "—"}</p>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="crm-info-panel__row">
                    <dt>UUID</dt>
                    <dd><UuidCopy value={user.uid || user.id} /></dd>
                  </div>
                  <div className="crm-info-panel__row">
                    <dt>Telegram</dt>
                    <dd>{user.telegram || "—"}</dd>
                  </div>
                  <div className="crm-info-panel__row">
                    <dt>التسجيل</dt>
                    <dd>{formatDateTime(user.createdAt)}</dd>
                  </div>
                  <div className="crm-info-panel__row">
                    <dt>آخر دخول</dt>
                    <dd>{formatDateTime(user.lastSignInAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="admin-user-preview-section">
                <h5 className="admin-heading text-sm">الخدمات والاشتراك</h5>
                <div className="admin-user-preview-stats mt-3">
                  <div>
                    <span>خدمات نشطة</span>
                    <strong>{stats?.activeServicesCount ?? 0}</strong>
                  </div>
                  <div>
                    <span>اشتراكات نشطة</span>
                    <strong>{stats?.activeSubscriptionsCount ?? 0}</strong>
                  </div>
                </div>
                <p className="mt-3 text-sm font-bold">
                  {activeSubscription
                    ? `${activeSubscription.serviceName || activeSubscription.planName || "اشتراك"} — ${activeSubscription.status || "—"}`
                    : "لا يوجد اشتراك نشط حالياً"}
                </p>
                {Array.isArray(services) && services.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                    {services.slice(0, 4).map((service) => (
                      <li key={service.key || service.serviceKey}>{service.serviceLabel || service.label}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="admin-user-preview-section">
                <h5 className="admin-heading text-sm">آخر النشاط</h5>
                {recentEvents.length > 0 ? (
                  <div className="crm-preview-activity mt-3">
                    {recentEvents.map((event) => (
                      <div key={event.id} className="crm-preview-activity__item">
                        <strong>{event.title}</strong>
                        <span>{event.dateLabel} — {event.timeLabel}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-bold text-slate-500">لا يوجد نشاط حديث.</p>
                )}
              </div>

              <Link
                href={`/admin/users/${encodeURIComponent(userId)}`}
                className="admin-user-center-open-btn"
                onClick={onClose}
                prefetch
              >
                فتح CRM الكامل
              </Link>
            </div>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body
  );
}
