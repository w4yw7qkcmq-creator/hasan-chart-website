"use client";

import Link from "next/link";
import Image from "next/image";
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
            <label className="text-xs font-bold text-slate-500">سبب الإجراء (إلزامي)</label>
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
          <header className="admin-user-center-page__hero">
            <div className="admin-user-center-page__hero-top">
              <Link href="/admin/users" className="admin-standalone-back-link">
                ← العودة إلى إدارة المستخدمين
              </Link>
              <button
                type="button"
                className="admin-btn-surface px-4 py-2"
                onClick={() => center.refreshSections([center.activeTab])}
              >
                تحديث
              </button>
            </div>
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
