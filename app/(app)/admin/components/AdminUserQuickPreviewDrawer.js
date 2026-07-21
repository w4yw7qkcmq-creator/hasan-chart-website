"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../../lib/admin-fetch";
import { fetchAdminUserSection } from "../../../../lib/admin-user-management-client";
import { sanitizeAdminUserFacingError } from "../../../../lib/admin-user-management-shared";

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
    </div>
  );
}

export default function AdminUserQuickPreviewDrawer({ open, userId, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const abortRef = useRef(null);
  const previousOverflowRef = useRef("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadPreview = useCallback(async () => {
    if (!userId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const overviewResult = await fetchAdminUserSection(adminFetch, userId, "overview", {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      setOverview(overviewResult);
    } catch (loadError) {
      if (loadError?.name === "AbortError") return;
      const sanitized = sanitizeAdminUserFacingError(loadError);
      setError(sanitized.message);
      setOverview(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return undefined;

    setOverview(null);
    void loadPreview();

    return () => abortRef.current?.abort();
  }, [loadPreview, open, userId]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflowRef.current;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !open || !userId) return null;

  const user = overview?.user;
  const stats = overview?.stats;

  return createPortal(
    <div className="admin-user-preview-overlay" role="presentation">
      <button type="button" className="admin-user-preview-overlay__backdrop" onClick={onClose} aria-label="إغلاق" />
      <aside className="admin-user-drawer admin-user-drawer--preview" aria-label="معاينة سريعة للمستخدم">
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
              <div className="admin-user-preview-card">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="admin-heading text-lg">{user.username || "—"}</h4>
                  <AccountStatusBadge status={user.accountStatus} label={user.accountStatusLabel} />
                </div>
                <p className="mt-2 text-sm font-bold text-slate-600">{user.email || "—"}</p>
                <div className="admin-user-preview-stats mt-4">
                  <div>
                    <span>خدمات نشطة</span>
                    <strong>{stats?.activeServicesCount ?? 0}</strong>
                  </div>
                  <div>
                    <span>اشتراكات نشطة</span>
                    <strong>{stats?.activeSubscriptionsCount ?? 0}</strong>
                  </div>
                </div>
              </div>

              <Link
                href={`/admin/users/${encodeURIComponent(userId)}`}
                className="admin-user-center-open-btn"
                onClick={onClose}
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
