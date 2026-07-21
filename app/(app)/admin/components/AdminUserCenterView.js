"use client";

import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef } from "react";
import { useAdminUserCenter } from "../../../../lib/use-admin-user-center";
import AdminUserDrawerShell from "./AdminUserDrawerShell";

const ACTION_ICONS = {
  suspend_user: "⏸️",
  unsuspend_user: "▶️",
  ban_user: "🚫",
  unban_user: "✅",
  soft_delete_user: "🗑️",
  restore_user: "♻️",
  force_logout: "🚪",
  password_reset_requested: "🔑",
  activate_service: "✨",
  deactivate_service: "⛔",
  extend_subscription: "📅",
};

function resolveActionIcon(action) {
  return ACTION_ICONS[action] || "🛡️";
}

export default function AdminUserActionConfirmModal({
  pendingAction,
  user,
  actionLoading,
  confirmEmail,
  actionReason,
  onConfirmEmailChange,
  onActionReasonChange,
  onCancel,
  onConfirm,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!pendingAction) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel, pendingAction]);

  if (!pendingAction) return null;

  const tone = pendingAction.tone || "neutral";
  const requireReason = Boolean(pendingAction.requireReason);
  const icon = pendingAction.icon || resolveActionIcon(pendingAction.action);
  const username = user?.username || user?.email || "—";
  const email = user?.email || "—";
  const statusLabel = user?.accountStatusLabel || user?.accountStatus || "—";

  return createPortal(
    <div className="admin-crm-action-modal" role="presentation">
      <button
        type="button"
        className="admin-crm-action-modal__backdrop"
        aria-label="إغلاق"
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`admin-crm-action-modal__dialog admin-crm-action-modal__dialog--${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-crm-action-modal__header">
          <div className="admin-crm-action-modal__header-main">
            <span className="admin-crm-action-modal__icon" aria-hidden="true">
              {icon}
            </span>
            <div className="min-w-0">
              <p className="admin-crm-action-modal__eyebrow">تأكيد الإجراء</p>
              <h3 id={titleId} className="admin-crm-action-modal__title">
                {pendingAction.title}
              </h3>
            </div>
          </div>
          <button type="button" className="admin-crm-action-modal__close" onClick={onCancel} aria-label="إغلاق">
            ×
          </button>
        </header>

        <div className="admin-crm-action-modal__body">
          <article className="admin-crm-action-modal__user-card">
            <div className="admin-crm-action-modal__user-row">
              <span className="admin-crm-action-modal__user-label">المستخدم</span>
              <strong className="admin-crm-action-modal__user-value">{username}</strong>
            </div>
            <div className="admin-crm-action-modal__user-row">
              <span className="admin-crm-action-modal__user-label">البريد</span>
              <strong className="admin-crm-action-modal__user-value">{email}</strong>
            </div>
            <div className="admin-crm-action-modal__user-row">
              <span className="admin-crm-action-modal__user-label">الحالة الحالية</span>
              <strong className="admin-crm-action-modal__user-value">{statusLabel}</strong>
            </div>
          </article>

          {pendingAction.description ? (
            <p className="admin-crm-action-modal__description">{pendingAction.description}</p>
          ) : null}

          <label className="admin-crm-action-modal__field">
            <span className="admin-crm-action-modal__field-label">
              سبب الإجراء{requireReason ? " (إلزامي)" : ""}
            </span>
            <textarea
              value={actionReason}
              onChange={(event) => onActionReasonChange(event.target.value)}
              className="admin-crm-action-modal__textarea admin-field"
              rows={4}
              placeholder="اكتب سببًا واضحًا للإجراء..."
            />
          </label>

          {pendingAction.dangerous ? (
            <label className="admin-crm-action-modal__field">
              <span className="admin-crm-action-modal__field-label">اكتب البريد للتأكيد</span>
              <input
                value={confirmEmail}
                onChange={(event) => onConfirmEmailChange(event.target.value)}
                className="admin-crm-action-modal__input admin-field"
                placeholder={pendingAction.targetEmail || "email@example.com"}
                autoComplete="off"
              />
            </label>
          ) : null}
        </div>

        <footer className="admin-crm-action-modal__footer">
          <button type="button" className="admin-crm-action-modal__btn admin-crm-action-modal__btn--cancel" onClick={onCancel}>
            إلغاء
          </button>
          <button
            type="button"
            disabled={Boolean(actionLoading)}
            className={`admin-crm-action-modal__btn admin-crm-action-modal__btn--confirm admin-crm-action-modal__btn--${tone}`}
            onClick={onConfirm}
          >
            {actionLoading ? "جاري التنفيذ..." : pendingAction.confirmLabel || "تأكيد"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export function AdminUserCenterView({
  userId,
  currentAdminUserId = "",
  layoutMode = "page",
  initialTab = "overview",
  onClose,
  onUserUpdated,
}) {
  const center = useAdminUserCenter({
    userId,
    enabled: Boolean(userId),
    currentAdminUserId,
    initialTab,
    onUserUpdated,
  });

  const user = center.sectionData.overview?.user;

  return (
    <>
      {layoutMode === "page" ? (
        <div className="admin-standalone-page admin-user-center-page">
          <div className="admin-user-center-page__sticky-toolbar">
            <div className="admin-user-center-page__sticky-toolbar-nav">
              <Link href="/admin/users" className="admin-user-center-page__sticky-btn admin-user-center-page__sticky-btn--primary">
                <span className="admin-user-center-page__sticky-label admin-user-center-page__sticky-label--full">
                  ← العودة إلى إدارة المستخدمين
                </span>
                <span className="admin-user-center-page__sticky-label admin-user-center-page__sticky-label--short">
                  ← المستخدمون
                </span>
              </Link>
              <Link href="/admin" className="admin-user-center-page__sticky-btn admin-user-center-page__sticky-btn--secondary">
                <span className="admin-user-center-page__sticky-label admin-user-center-page__sticky-label--full">
                  لوحة الإدارة
                </span>
                <span className="admin-user-center-page__sticky-label admin-user-center-page__sticky-label--short">
                  لوحة الإدارة
                </span>
              </Link>
            </div>
            <p className="admin-user-center-page__sticky-title" title={user?.email || ""}>
              {user?.username || user?.email || "المستخدم"}
            </p>
            <button
              type="button"
              className="admin-user-center-page__sticky-refresh"
              onClick={() => center.refreshSections([center.activeTab])}
            >
              تحديث
            </button>
          </div>

          <header className="admin-user-center-page__hero">
            <div className="admin-user-center-page__hero-main">
              <div className="admin-user-center-page__identity">
                <div className="admin-user-center-page__identity-row">
                  <div className="admin-user-avatar admin-user-avatar--hero" aria-hidden="true">
                    {user?.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt=""
                        width={72}
                        height={72}
                        className="admin-user-avatar__image admin-user-avatar--lg"
                        unoptimized
                      />
                    ) : (
                      <span className="admin-user-avatar__initials admin-user-avatar--lg">
                        {String(user?.username || user?.email || "؟").trim().slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="admin-user-hero__eyebrow">مركز CRM للمستخدم</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="admin-heading text-3xl">{user?.username || user?.email || "المستخدم"}</h1>
                      {user?.accountStatusLabel ? (
                        <span className={`admin-user-status admin-user-status--${user.accountStatus || "active"}`}>
                          {user.accountStatusIcon} {user.accountStatusLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="admin-user-center-page__email">{user?.email || "—"}</p>
                    <p className="admin-user-center-page__uid">{user?.uid || user?.id || ""}</p>
                    <dl className="admin-user-center-page__meta-grid">
                      <div>
                        <dt>Telegram</dt>
                        <dd>{user?.telegram || "—"}</dd>
                      </div>
                      <div>
                        <dt>الدور</dt>
                        <dd>{user?.role || "user"}</dd>
                      </div>
                      <div>
                        <dt>التسجيل</dt>
                        <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString("ar") : "—"}</dd>
                      </div>
                      <div>
                        <dt>آخر دخول</dt>
                        <dd>{user?.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("ar") : "—"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
              {center.sectionState?.overview?.loading && !center.sectionData.overview?.stats ? (
                <div className="admin-user-stat-grid admin-user-center-page__hero-stats admin-user-stat-grid--skeleton animate-pulse">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="admin-user-stat-card admin-user-stat-card--skeleton h-20" />
                  ))}
                </div>
              ) : center.sectionData.overview?.stats ? (
                <div className="admin-user-stat-grid admin-user-center-page__hero-stats admin-user-stat-grid--premium">
                  <article className="admin-user-stat-card admin-user-stat-card--premium">
                    <span className="admin-user-stat-card__icon" aria-hidden="true">⭐</span>
                    <p className="admin-user-stat-card__label">خدمات نشطة</p>
                    <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.activeServicesCount ?? 0}</p>
                  </article>
                  <article className="admin-user-stat-card admin-user-stat-card--premium">
                    <span className="admin-user-stat-card__icon" aria-hidden="true">💳</span>
                    <p className="admin-user-stat-card__label">اشتراكات نشطة</p>
                    <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.activeSubscriptionsCount ?? 0}</p>
                  </article>
                  <article className="admin-user-stat-card admin-user-stat-card--premium">
                    <span className="admin-user-stat-card__icon" aria-hidden="true">📋</span>
                    <p className="admin-user-stat-card__label">الطلبات</p>
                    <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.requestsCount ?? 0}</p>
                  </article>
                  <article className="admin-user-stat-card admin-user-stat-card--premium">
                    <span className="admin-user-stat-card__icon" aria-hidden="true">🔔</span>
                    <p className="admin-user-stat-card__label">التنبيهات</p>
                    <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.alertsCount ?? 0}</p>
                  </article>
                </div>
              ) : null}
            </div>
          </header>

          <AdminUserDrawerShell
            layoutMode={layoutMode}
            activeTab={center.activeTab}
            tabs={center.tabs}
            onTabChange={center.setActiveTab}
            onClose={onClose}
            overview={center.sectionData.overview}
            services={center.sectionData.services}
            subscriptions={center.sectionData.subscriptions}
            payments={center.sectionData.payments}
            notifications={center.sectionData.notifications}
            emails={center.sectionData.emails}
            activity={center.sectionData.activity}
            notes={center.sectionData.notes}
            management={center.sectionData.management}
            audit={center.sectionData.audit}
            sectionState={center.sectionState}
            pages={center.pages}
            actionLoading={center.actionLoading}
            currentAdminUserId={currentAdminUserId}
            onPageChange={center.handlePageChange}
            onRefreshSection={(section) => center.refreshSections([section])}
            onRequestAction={center.setPendingAction}
            onRunAction={center.runAction}
            onAddNote={center.noteHandlers.onAddNote}
            onUpdateNote={center.noteHandlers.onUpdateNote}
            onDeleteNote={center.noteHandlers.onDeleteNote}
            onTogglePinNote={center.noteHandlers.onTogglePinNote}
            activityFilter={center.activityFilter}
            onActivityFilterChange={center.handleActivityFilterChange}
          />
        </div>
      ) : (
        <AdminUserDrawerShell
          layoutMode={layoutMode}
          activeTab={center.activeTab}
          tabs={center.tabs}
          onTabChange={center.setActiveTab}
          onClose={onClose}
          overview={center.sectionData.overview}
          services={center.sectionData.services}
          subscriptions={center.sectionData.subscriptions}
          payments={center.sectionData.payments}
          notifications={center.sectionData.notifications}
          emails={center.sectionData.emails}
          activity={center.sectionData.activity}
          notes={center.sectionData.notes}
          management={center.sectionData.management}
          audit={center.sectionData.audit}
          sectionState={center.sectionState}
          pages={center.pages}
          actionLoading={center.actionLoading}
          currentAdminUserId={currentAdminUserId}
          onPageChange={center.handlePageChange}
          onRefreshSection={(section) => center.refreshSections([section])}
          onRequestAction={center.setPendingAction}
          onRunAction={center.runAction}
          onAddNote={center.noteHandlers.onAddNote}
          onUpdateNote={center.noteHandlers.onUpdateNote}
          onDeleteNote={center.noteHandlers.onDeleteNote}
          onTogglePinNote={center.noteHandlers.onTogglePinNote}
          activityFilter={center.activityFilter}
          onActivityFilterChange={center.handleActivityFilterChange}
        />
      )}

      <AdminUserActionConfirmModal
        pendingAction={center.pendingAction}
        user={user}
        actionLoading={center.actionLoading}
        confirmEmail={center.confirmEmail}
        actionReason={center.actionReason}
        onConfirmEmailChange={center.setConfirmEmail}
        onActionReasonChange={center.setActionReason}
        onCancel={() => {
          center.setPendingAction(null);
          center.setConfirmEmail("");
          center.setActionReason("");
        }}
        onConfirm={() =>
          void center.runAction(center.pendingAction.action, {
            payload: center.pendingAction.payload || {},
            dangerous: center.pendingAction.dangerous,
            targetEmail: center.pendingAction.targetEmail,
            reason: center.actionReason,
            refresh: center.pendingAction.refresh,
            requireReason: center.pendingAction.requireReason,
          })
        }
      />
    </>
  );
}
