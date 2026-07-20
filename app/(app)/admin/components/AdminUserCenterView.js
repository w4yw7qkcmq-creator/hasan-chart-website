"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useAdminUserCenter } from "../../../../lib/use-admin-user-center";
import AdminUserDrawerShell from "./AdminUserDrawerShell";

export default function AdminUserActionConfirmModal({
  pendingAction,
  actionLoading,
  confirmEmail,
  actionReason,
  onConfirmEmailChange,
  onActionReasonChange,
  onCancel,
  onConfirm,
}) {
  if (!pendingAction) return null;

  return createPortal(
    <div className="admin-user-delete-modal">
      <div className="admin-user-delete-modal__dialog admin-modal admin-user-confirm-modal">
        <p className="admin-user-confirm-modal__eyebrow">تأكيد الإجراء</p>
        <h3 className="admin-heading text-2xl">{pendingAction.title}</h3>
        <p className="mt-3 text-sm leading-7 text-slate-600">{pendingAction.description}</p>
        {pendingAction.requireReason ? (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-500">سبب التعليق (إلزامي)</label>
            <textarea
              value={actionReason}
              onChange={(event) => onActionReasonChange(event.target.value)}
              className="admin-field mt-2 min-h-20 font-bold"
              placeholder="اكتب سببًا واضحًا..."
            />
          </div>
        ) : null}
        {pendingAction.dangerous ? (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-500">اكتب البريد للتأكيد</label>
            <input
              value={confirmEmail}
              onChange={(event) => onConfirmEmailChange(event.target.value)}
              className="admin-field mt-2 font-bold"
              placeholder={pendingAction.targetEmail || "email@example.com"}
            />
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="admin-btn-surface px-5 py-3" onClick={onCancel}>
            إلغاء
          </button>
          <button
            type="button"
            disabled={Boolean(actionLoading)}
            className={`admin-user-confirm-modal__confirm admin-user-confirm-modal__confirm--${pendingAction.tone || "neutral"}`}
            onClick={onConfirm}
          >
            {actionLoading ? "جاري التنفيذ..." : pendingAction.confirmLabel}
          </button>
        </div>
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
          <div className="admin-standalone-page__toolbar">
            <Link href="/admin/users" className="admin-standalone-back-link">
              ← العودة إلى إدارة المستخدمين
            </Link>
            <button
              type="button"
              className="admin-btn-surface px-4 py-2"
              onClick={() => center.refreshSections(["overview"])}
            >
              تحديث
            </button>
          </div>

          <header className="admin-user-center-page__hero">
            <div>
              <p className="admin-user-hero__eyebrow">مركز CRM للمستخدم</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="admin-heading text-3xl">{user?.username || user?.email || "المستخدم"}</h1>
                {user?.accountStatusLabel ? (
                  <span className={`admin-user-status admin-user-status--${user.accountStatus || "active"}`}>
                    {user.accountStatusIcon} {user.accountStatusLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm font-bold text-slate-500">{user?.email || "—"}</p>
              <p className="text-xs font-bold text-slate-400">{user?.uid || user?.id || ""}</p>
              <p className="mt-2 text-sm font-bold text-slate-500">
                إدارة كاملة للمعلومات، الخدمات، الاشتراكات، المدفوعات، الملاحظات، والنشاط.
              </p>
            </div>
            {center.sectionData.overview?.stats ? (
              <div className="admin-user-stat-grid admin-user-center-page__hero-stats">
                <article className="admin-user-stat-card">
                  <p className="admin-user-stat-card__label">خدمات نشطة</p>
                  <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.activeServicesCount ?? 0}</p>
                </article>
                <article className="admin-user-stat-card">
                  <p className="admin-user-stat-card__label">اشتراكات نشطة</p>
                  <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.activeSubscriptionsCount ?? 0}</p>
                </article>
                <article className="admin-user-stat-card">
                  <p className="admin-user-stat-card__label">الطلبات</p>
                  <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.requestsCount ?? 0}</p>
                </article>
                <article className="admin-user-stat-card">
                  <p className="admin-user-stat-card__label">التنبيهات</p>
                  <p className="admin-user-stat-card__value">{center.sectionData.overview.stats.alertsCount ?? 0}</p>
                </article>
              </div>
            ) : null}
          </header>
        </div>
      ) : null}

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

      <AdminUserActionConfirmModal
        pendingAction={center.pendingAction}
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
          })
        }
      />
    </>
  );
}
