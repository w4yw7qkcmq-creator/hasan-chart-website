"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  ADMIN_SECTION_EMPTY_MESSAGE,
  ADMIN_SECTION_NOT_ENABLED_MESSAGE,
  ADMIN_SECTION_PHASE_MESSAGE,
} from "../../../../lib/admin-user-management-shared";
import { canRemoveSubscriptionRequest, isAdminSubscriptionActiveDisplay, resolveAdminSubscriptionBadgeClass } from "../../../../lib/admin-subscription-request-remove-shared";
import { TIMELINE_FILTER_OPTIONS } from "./admin-user-management-ux-helpers";
import AdminPaymentProofModal from "./AdminPaymentProofModal";
import { adminFetch } from "../../../../lib/admin-fetch";
import { fetchPaymentProof } from "../../../../lib/admin-financial-center-client";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar");
}

function AccountStatusBadge({ status, label, icon }) {
  const tone =
    status === "banned"
      ? "admin-user-status--banned"
      : status === "suspended"
      ? "admin-user-status--suspended"
      : status === "deleted"
      ? "admin-user-status--deleted"
      : "admin-user-status--active";

  return (
    <span className={`admin-user-status ${tone}`}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}

function UserAvatar({ name, avatarUrl, size = "md" }) {
  const initials = String(name || "؟").trim().slice(0, 2).toUpperCase();
  const sizeClass = size === "lg" ? "admin-user-avatar--lg" : "";

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name || "المستخدم"}
        width={size === "lg" ? 72 : 44}
        height={size === "lg" ? 72 : 44}
        className={`admin-user-avatar__image ${sizeClass}`}
        unoptimized
      />
    );
  }

  return <span className={`admin-user-avatar__initials ${sizeClass}`}>{initials}</span>;
}

function SectionSkeleton({ rows = 4 }) {
  return (
    <div className="admin-premium-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="admin-premium-skeleton__row animate-pulse" />
      ))}
    </div>
  );
}

function SectionNotEnabledState({ message, detail }) {
  return (
    <div className="admin-user-section-state admin-user-section-state--disabled">
      <span className="admin-user-section-state__icon" aria-hidden="true">
        🚧
      </span>
      <p className="admin-user-section-state__title">{message || ADMIN_SECTION_NOT_ENABLED_MESSAGE}</p>
      <p className="admin-user-section-state__detail">{detail || ADMIN_SECTION_PHASE_MESSAGE}</p>
    </div>
  );
}

function SectionErrorState({ message, onRetry }) {
  return (
    <div className="admin-user-section-state admin-user-section-state--error">
      <span className="admin-user-section-state__icon" aria-hidden="true">
        ⚠️
      </span>
      <p className="admin-user-section-state__title">{message || "تعذر تحميل هذا القسم."}</p>
      <button type="button" className="admin-btn-surface mt-4 px-5 py-3" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </div>
  );
}

function SectionEmptyDataState({ icon = "📭", message = ADMIN_SECTION_EMPTY_MESSAGE, detail = "لا توجد بيانات لعرضها في هذا القسم حالياً." }) {
  return (
    <div className="admin-premium-empty admin-premium-empty--compact">
      <span className="admin-premium-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="admin-premium-empty__title">{message}</p>
      <p className="admin-premium-empty__desc">{detail}</p>
    </div>
  );
}

function isSectionUnavailable(data) {
  return data?.available === false;
}

function renderSectionFrame(section, { sectionState, data, onRefreshSection, children, skeletonRows = 4 }) {
  const state = sectionState?.[section];

  if (state?.loading) {
    return <SectionSkeleton rows={skeletonRows} />;
  }

  if (isSectionUnavailable(data) || state?.errorKind === "not_enabled") {
    return (
      <SectionNotEnabledState
        message={data?.message || state?.error}
        detail={data?.detail || state?.detail}
      />
    );
  }

  if (state?.error) {
    return (
      <SectionErrorState
        message={state.error}
        onRetry={() => onRefreshSection(section)}
      />
    );
  }

  return children;
}

function PaginationBar({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <div className="admin-user-timeline__pagination">
      <button type="button" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>
        السابق
      </button>
      <span>
        {pagination.page} / {pagination.totalPages}
      </span>
      <button
        type="button"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        التالي
      </button>
    </div>
  );
}

function UserHeroCard({ user, stats }) {
  if (!user) return null;

  return (
    <section className="admin-user-hero">
      <div className="admin-user-hero__main">
        <div className="admin-user-avatar admin-user-avatar--hero">
          <UserAvatar name={user.username || user.email} avatarUrl={user.avatarUrl} size="lg" />
        </div>
        <div className="admin-user-hero__identity">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="admin-heading text-2xl">{user.username || "—"}</h3>
            <AccountStatusBadge status={user.accountStatus} label={user.accountStatusLabel} icon={user.accountStatusIcon} />
          </div>
          <p className="admin-user-hero__email">{user.email || "—"}</p>
          <p className="admin-user-hero__uid">{user.uid}</p>
        </div>
      </div>
      <div className="admin-user-hero__meta">
        <div>
          <p className="admin-user-hero__meta-label">Telegram</p>
          <p className="admin-user-hero__meta-value">{user.telegram || "—"}</p>
        </div>
        <div>
          <p className="admin-user-hero__meta-label">الدور</p>
          <p className="admin-user-hero__meta-value">{user.role || "user"}</p>
        </div>
        <div>
          <p className="admin-user-hero__meta-label">تاريخ التسجيل</p>
          <p className="admin-user-hero__meta-value">{formatDateTime(user.createdAt)}</p>
        </div>
        <div>
          <p className="admin-user-hero__meta-label">آخر تسجيل دخول</p>
          <p className="admin-user-hero__meta-value">{formatDateTime(user.lastSignInAt)}</p>
        </div>
        {user.statusReason ? (
          <div className="md:col-span-2">
            <p className="admin-user-hero__meta-label">سبب الحالة</p>
            <p className="admin-user-hero__meta-value">{user.statusReason}</p>
          </div>
        ) : null}
        {user.statusUpdatedAt ? (
          <div>
            <p className="admin-user-hero__meta-label">آخر تعديل للحالة</p>
            <p className="admin-user-hero__meta-value">{formatDateTime(user.statusUpdatedAt)}</p>
          </div>
        ) : null}
      </div>
      <div className="admin-user-stat-grid">
        <article className="admin-user-stat-card">
          <p className="admin-user-stat-card__label">خدمات نشطة</p>
          <p className="admin-user-stat-card__value">{stats?.activeServicesCount ?? 0}</p>
        </article>
        <article className="admin-user-stat-card">
          <p className="admin-user-stat-card__label">اشتراكات نشطة</p>
          <p className="admin-user-stat-card__value">{stats?.activeSubscriptionsCount ?? 0}</p>
        </article>
        <article className="admin-user-stat-card">
          <p className="admin-user-stat-card__label">عدد الطلبات</p>
          <p className="admin-user-stat-card__value">{stats?.requestsCount ?? 0}</p>
        </article>
        <article className="admin-user-stat-card">
          <p className="admin-user-stat-card__label">عدد التنبيهات</p>
          <p className="admin-user-stat-card__value">{stats?.alertsCount ?? 0}</p>
        </article>
      </div>
    </section>
  );
}

const MANAGEMENT_SECTIONS = [
  {
    title: "حالة الحساب",
    actions: [
      { action: "suspend_user", label: "تعليق الحساب", tone: "danger", title: "تعليق الحساب", description: "سيتم تعليق وصول المستخدم إلى الخدمات المحمية وإنهاء جلساته.", confirmLabel: "تأكيد التعليق", requireReason: true },
      { action: "unsuspend_user", label: "رفع التعليق", tone: "neutral", title: "رفع التعليق", description: "استعادة وصول المستخدم.", confirmLabel: "تأكيد" },
      { action: "unban_user", label: "إلغاء الحظر", tone: "neutral", title: "إلغاء الحظر", description: "إزالة الحظر عن المستخدم.", confirmLabel: "تأكيد" },
      { action: "restore_user", label: "استعادة الحساب", tone: "success", title: "استعادة الحساب", description: "إعادة تفعيل حساب محذوف/موقوف.", confirmLabel: "تأكيد الاستعادة" },
    ],
  },
  {
    title: "إجراءات الجلسة والأمان",
    actions: [
      { action: "force_logout", label: "تسجيل خروج شامل", tone: "warning", title: "تسجيل خروج من جميع الأجهزة", description: "إنهاء جميع الجلسات النشطة.", confirmLabel: "تأكيد", requireReason: true },
      { action: "password_reset_requested", label: "طلب إعادة تعيين كلمة المرور", tone: "neutral", title: "إعادة تعيين كلمة المرور", description: "إنشاء رابط است recovery عبر Supabase Admin.", confirmLabel: "تأكيد الإرسال" },
    ],
  },
  {
    title: "إجراءات خطرة",
    actions: [
      { action: "ban_user", label: "حظر المستخدم", tone: "danger", title: "حظر المستخدم", description: "منع تسجيل الدخول عبر Auth ban.", confirmLabel: "تأكيد الحظر", dangerous: true, requireReason: true },
      { action: "soft_delete_user", label: "حذف الحساب", tone: "danger", title: "حذف الحساب (Soft Delete)", description: "لن يتم حذف auth.users. سيتم منع الحساب من استخدام المنصة ويمكن استعادته لاحقًا.", confirmLabel: "تأكيد الحذف", dangerous: true, requireReason: true },
    ],
  },
];

export default function AdminUserDrawerShell({
  activeTab,
  tabs,
  layoutMode = "drawer",
  drawerViewMode = "drawer",
  onDrawerViewModeChange,
  onTabChange,
  onClose,
  overview,
  services,
  subscriptions,
  payments,
  notifications,
  emails,
  activity,
  notes,
  management,
  audit,
  sectionState,
  pages,
  actionLoading,
  subscriptionRemoveLoading = false,
  currentAdminUserId,
  onPageChange,
  onRefreshSection,
  onRequestAction,
  onRunAction,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onTogglePinNote,
  activityFilter = "all",
  onActivityFilterChange,
  onRequestSubscriptionRemove,
}) {
  const user = overview?.user;
  const [noteDraft, setNoteDraft] = useState("");
  const [manualExpiry, setManualExpiry] = useState("");
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editingNoteText, setEditingNoteText] = useState("");
  const [proofPreview, setProofPreview] = useState(null);
  const [proofLoadingId, setProofLoadingId] = useState("");

  const openPaymentProof = async (requestId) => {
    if (!requestId || proofLoadingId) return;
    setProofLoadingId(String(requestId));
    try {
      const proof = await fetchPaymentProof(adminFetch, requestId);
      setProofPreview({
        ...proof,
        planName: proof.planName || proof.plan,
      });
    } catch {
      setProofPreview({
        planName: "طلب اشتراك",
        proof: "",
        isInline: false,
      });
    } finally {
      setProofLoadingId("");
    }
  };

  const subscriptionActions = useMemo(
    () => [
      { action: "extend_subscription", label: "+7 أيام", payload: { preset: "7d", days: 7 } },
      { action: "extend_subscription", label: "+30 يومًا", payload: { preset: "1m", days: 30 } },
      { action: "extend_subscription", label: "+90 يومًا", payload: { preset: "3m", days: 90 } },
      { action: "extend_subscription", label: "+365 يومًا", payload: { preset: "1y", days: 365 } },
    ],
    []
  );

  const isSelfTarget = String(currentAdminUserId || "") === String(user?.id || user?.uid || "");

  const isPageLayout = layoutMode === "page";
  const isFullscreen = !isPageLayout && drawerViewMode === "fullscreen";

  return (
    <aside
      className={`admin-user-drawer admin-user-drawer--wide ${
        isPageLayout ? "admin-user-center-shell admin-user-center-shell--page" : ""
      } ${isFullscreen ? "admin-user-drawer--fullscreen" : ""}`}
      aria-label="إدارة المستخدم"
    >
      {!isPageLayout ? (
      <div className="admin-user-drawer__header">
        <div>
          <p className="admin-user-hero__eyebrow">مركز CRM للمستخدم</p>
          <h3 className="admin-heading text-2xl">{user?.username || user?.email || "المستخدم"}</h3>
        </div>
        <div className="admin-user-drawer__header-actions">
          <div className="admin-user-drawer__view-toggle" role="group" aria-label="نمط العرض">
            <button
              type="button"
              className={`admin-user-drawer__view-toggle-btn ${drawerViewMode === "drawer" ? "is-active" : ""}`}
              onClick={() => onDrawerViewModeChange?.("drawer")}
              title="عرض جانبي — Drawer"
              aria-pressed={drawerViewMode === "drawer"}
            >
              Drawer
            </button>
            <button
              type="button"
              className={`admin-user-drawer__view-toggle-btn ${isFullscreen ? "is-active" : ""}`}
              onClick={() => onDrawerViewModeChange?.("fullscreen")}
              title="ملء الشاشة — Full Screen"
              aria-pressed={isFullscreen}
            >
              Full Screen
            </button>
          </div>
          <button type="button" className="admin-user-drawer__close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      ) : null}

      <div className={`admin-user-drawer__tabs admin-user-drawer__tabs--scroll ${isPageLayout ? "admin-user-drawer__tabs--sticky" : ""}`} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-user-drawer__tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className={`admin-user-drawer__body ${isPageLayout ? "admin-user-drawer__body--page" : ""}`}>
        {activeTab === "overview" &&
          renderSectionFrame("overview", {
            sectionState,
            data: overview,
            onRefreshSection,
            skeletonRows: 8,
            children: <UserHeroCard user={user} stats={overview?.stats} />,
          })}

        {activeTab === "services" &&
          renderSectionFrame("services", {
            sectionState,
            data: services,
            onRefreshSection,
            children:
              (services?.services || []).length > 0 ? (
                <div className="admin-user-services-grid">
                  {(services?.services || []).map((service) => (
                <article key={service.key} className="admin-user-service-tile">
                  <div className="admin-user-service-tile__head">
                    <div className="admin-user-service-tile__title">
                      <span>{service.icon}</span>
                      <h5>{service.serviceLabel}</h5>
                    </div>
                    <span className={`admin-user-service-tile__badge ${service.isActive ? "is-active" : "is-inactive"}`}>
                      {service.statusIcon} {service.status}
                    </span>
                  </div>
                  <div className="admin-user-service-tile__dates">
                    <p><span>المصدر</span><strong>{service.source || "—"}</strong></p>
                    <p><span>البداية</span><strong>{formatDateTime(service.startedAt)}</strong></p>
                    <p><span>الانتهاء</span><strong>{formatDateTime(service.endsAt)}</strong></p>
                    {!service.manageable ? (
                      <p className="text-xs text-amber-300">{service.unmanageableReason || "غير قابلة للإدارة"}</p>
                    ) : null}
                  </div>
                  <div className="admin-user-service-tile__actions">
                    <button
                      type="button"
                      disabled={Boolean(actionLoading) || !service.manageable}
                      onClick={() =>
                        onRequestAction({
                          action: "activate_service",
                          title: `تفعيل ${service.serviceLabel}`,
                          description: "تفعيل الخدمة فعلياً في قاعدة البيانات.",
                          confirmLabel: "تفعيل",
                          tone: "success",
                          payload: { serviceKey: service.serviceKey },
                          refresh: ["overview", "services"],
                        })
                      }
                    >
                      تفعيل
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(actionLoading) || !service.manageable}
                      onClick={() =>
                        onRequestAction({
                          action: "deactivate_service",
                          title: `إيقاف ${service.serviceLabel}`,
                          description: "إيقاف الخدمة فعلياً.",
                          confirmLabel: "إيقاف",
                          tone: "warning",
                          payload: { serviceKey: service.serviceKey },
                          refresh: ["overview", "services"],
                        })
                      }
                    >
                      إيقاف
                    </button>
                  </div>
                </article>
              ))}
                </div>
              ) : (
                <SectionEmptyDataState icon="🧩" />
              ),
          })}

        {activeTab === "subscriptions" &&
          renderSectionFrame("subscriptions", {
            sectionState,
            data: subscriptions,
            onRefreshSection,
            skeletonRows: 6,
            children:
              (subscriptions?.subscriptions || []).length > 0 ? (
                <>
                  <div className="admin-user-services-grid">
                    {(subscriptions?.subscriptions || []).map((sub) => {
                      const isActive = isAdminSubscriptionActiveDisplay(sub);
                      const canRemove = canRemoveSubscriptionRequest(sub.rawStatus, sub.adminDisabled);
                      const badgeClass = resolveAdminSubscriptionBadgeClass(sub);

                      return (
                  <article key={sub.id} className="admin-user-service-tile">
                    <div className="admin-user-service-tile__head">
                      <div>
                        <h5 className="font-black">{sub.serviceName}</h5>
                        <p className="text-xs text-slate-400">{sub.planName} — {sub.category}</p>
                      </div>
                      <span className={`admin-user-service-tile__badge ${badgeClass}`}>{sub.status}</span>
                    </div>
                    <div className="admin-user-service-tile__dates">
                      <p><span>البداية</span><strong>{formatDateTime(sub.startedAt)}</strong></p>
                      <p><span>الانتهاء</span><strong>{formatDateTime(sub.endsAt)}</strong></p>
                      <p><span>المصدر</span><strong>{sub.activationSource}</strong></p>
                      <p><span>تجديد تلقائي</span><strong>{sub.autoRenew ? "نعم" : "لا"}</strong></p>
                      {sub.adminDisabled ? (
                        <p><span>إدارة</span><strong>تم إنهاؤه من الإدارة</strong></p>
                      ) : null}
                    </div>
                    {isActive ? (
                      <>
                    <div className="admin-user-actions-grid">
                      {subscriptionActions.map((item) => (
                        <button
                          key={`${sub.id}-${item.label}`}
                          type="button"
                          disabled={Boolean(actionLoading) || subscriptionRemoveLoading}
                          className="admin-user-action-btn"
                          onClick={() =>
                            onRequestAction({
                              action: item.action,
                              title: `${item.label} — ${sub.serviceName}`,
                              description: "تمديد اشتراك المستخدم.",
                              confirmLabel: item.label,
                              payload: { subscriptionId: sub.id, ...(item.payload || {}) },
                              refresh: ["overview", "services", "subscriptions", "activity"],
                            })
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <input
                        type="datetime-local"
                        value={manualExpiry}
                        onChange={(event) => setManualExpiry(event.target.value)}
                        className="admin-field text-sm"
                        disabled={Boolean(actionLoading) || subscriptionRemoveLoading}
                      />
                      <button
                        type="button"
                        className="admin-user-action-btn"
                        disabled={Boolean(actionLoading) || subscriptionRemoveLoading}
                        onClick={() =>
                          onRequestAction({
                            action: "extend_subscription",
                            title: "تحديد تاريخ انتهاء",
                            description: "تعيين تاريخ انتهاء يدوي (UTC).",
                            confirmLabel: "حفظ",
                            payload: {
                              subscriptionId: sub.id,
                              expiresAt: manualExpiry ? new Date(manualExpiry).toISOString() : null,
                            },
                            refresh: ["overview", "services", "subscriptions", "activity"],
                          })
                        }
                      >
                        حفظ تاريخ الانتهاء
                      </button>
                    </div>
                    {canRemove ? (
                      <button
                        type="button"
                        className="admin-user-action-btn admin-user-action-btn--danger mt-3 w-full"
                        disabled={Boolean(actionLoading) || subscriptionRemoveLoading}
                        onClick={() => onRequestSubscriptionRemove?.(sub)}
                      >
                        إزالة الاشتراك
                      </button>
                    ) : null}
                      </>
                    ) : null}
                  </article>
                      );
                    })}
                  </div>
                  <PaginationBar
                    pagination={subscriptions?.pagination}
                    onPageChange={(page) => onPageChange("subscriptions", page)}
                  />
                </>
              ) : (
                <SectionEmptyDataState icon="💳" />
              ),
          })}

        {activeTab === "payments" &&
          renderSectionFrame("payments", {
            sectionState,
            data: payments,
            onRefreshSection,
            children: (
              <>
                <p className="admin-user-payments-disclaimer">{payments?.disclaimer}</p>
                {(payments?.reviews || []).length > 0 ? (
                  <>
                    <div className="admin-table-wrap mt-4 overflow-x-auto">
                      <table className="admin-user-table">
                        <thead>
                          <tr>
                            <th>الخطة</th>
                            <th>السعر</th>
                            <th>حالة المراجعة</th>
                            <th>تاريخ الطلب</th>
                            <th>تاريخ التفعيل</th>
                            <th>إثبات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(payments?.reviews || []).map((review) => (
                            <tr key={review.id}>
                              <td>{review.plan || "—"}</td>
                              <td>{review.priceRaw || "—"}</td>
                              <td>{review.status}</td>
                              <td>{formatDateTime(review.submittedAt)}</td>
                              <td>{formatDateTime(review.confirmedAt)}</td>
                              <td>{review.proofAvailable ? (
                                <button
                                  type="button"
                                  className="admin-user-manage-btn"
                                  disabled={proofLoadingId === String(review.requestId)}
                                  onClick={() => void openPaymentProof(review.requestId)}
                                >
                                  {proofLoadingId === String(review.requestId) ? "..." : "معاينة"}
                                </button>
                              ) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-xs font-bold text-amber-700/90">
                      وجود إثبات دفع لا يعني أن العملية مؤكدة.
                    </p>
                    <PaginationBar
                      pagination={payments?.pagination}
                      onPageChange={(page) => onPageChange("payments", page)}
                    />
                  </>
                ) : (
                  <SectionEmptyDataState icon="💰" message="لا توجد طلبات بإثبات دفع لهذا المستخدم." />
                )}
              </>
            ),
          })}

        {activeTab === "communications" &&
          renderSectionFrame("notifications", {
            sectionState,
            data: notifications,
            onRefreshSection: () => {
              onRefreshSection("notifications");
              onRefreshSection("emails");
            },
            children: (
              <div className="space-y-6">
                <section>
                  <h4 className="admin-heading text-lg">الإشعارات</h4>
                  {(notifications?.notifications || []).length > 0 ? (
                    <>
                      <div className="mt-3 space-y-3">
                        {(notifications?.notifications || []).map((row) => (
                          <article key={row.id} className="admin-user-service-tile">
                            <div className="flex justify-between gap-3">
                              <h5 className="font-black">{row.title}</h5>
                              <span className={`admin-user-status ${row.isRead ? "admin-user-status--active" : ""}`}>
                                {row.isRead ? "مقروء" : "غير مقروء"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{row.message}</p>
                            <p className="mt-2 text-xs text-slate-500">{row.type} — {formatDateTime(row.createdAt)}</p>
                          </article>
                        ))}
                      </div>
                      <PaginationBar
                        pagination={notifications?.pagination}
                        onPageChange={(page) => onPageChange("notifications", page)}
                      />
                    </>
                  ) : (
                    <div className="mt-3">
                      <SectionEmptyDataState icon="📣" message="لا توجد إشعارات لهذا المستخدم." />
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="admin-heading text-lg">البريد الإلكتروني</h4>
                  {(emails?.emails || []).length > 0 ? (
                    <>
                      <div className="mt-3 space-y-3">
                        {(emails?.emails || []).map((row) => (
                          <article key={row.id} className="admin-user-service-tile">
                            <div className="flex justify-between gap-3">
                              <h5 className="font-black">{row.subject || row.messageType}</h5>
                              <span className="admin-user-status">{row.status}</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              {row.messageType} — {formatDateTime(row.createdAt)}
                              {row.sentAt ? ` — أُرسل: ${formatDateTime(row.sentAt)}` : " — لم يُرسل بعد"}
                            </p>
                            {row.error ? <p className="mt-1 text-xs text-amber-700">فشل إرسال الرسالة</p> : null}
                          </article>
                        ))}
                      </div>
                      <PaginationBar pagination={emails?.pagination} onPageChange={(page) => onPageChange("emails", page)} />
                    </>
                  ) : (
                    <div className="mt-3">
                      <SectionEmptyDataState icon="✉️" message="لا توجد رسائل بريد مسجلة." />
                    </div>
                  )}
                </section>
              </div>
            ),
          })}

        {activeTab === "activity" &&
          renderSectionFrame("activity", {
            sectionState,
            data: activity,
            onRefreshSection,
            skeletonRows: 6,
            children:
              (activity?.events || []).length > 0 ? (
                <>
                  <div className="admin-user-timeline-filters">
                    {TIMELINE_FILTER_OPTIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`admin-user-timeline-filters__btn ${
                          activityFilter === item.id ? "is-active" : ""
                        }`}
                        onClick={() => onActivityFilterChange?.(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  { (activity?.events || []).length > 0 ? (
                    <>
                      <ol className="admin-user-timeline">
                        {(activity?.events || []).map((event) => (
                  <li key={event.id} className="admin-user-timeline__item">
                    <div className="admin-user-timeline__icon">{event.icon}</div>
                    <div className="admin-user-timeline__content">
                      <div className="admin-user-timeline__head">
                        <p className="admin-user-timeline__title">{event.title}</p>
                        <span className="admin-user-timeline__type">{event.label}</span>
                      </div>
                      <p className="admin-user-timeline__time">
                        {event.dateLabel} — {event.timeLabel}
                        {event.meta?.adminEmail ? ` — ${event.meta.adminEmail}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
                      </ol>
                      <PaginationBar pagination={activity?.pagination} onPageChange={(page) => onPageChange("activity", page)} />
                    </>
                  ) : (
                    <SectionEmptyDataState icon="🕒" message="لا توجد أحداث ضمن هذا الفلتر." />
                  )}
                </>
              ) : (
                <SectionEmptyDataState icon="🕒" />
              ),
          })}

        {activeTab === "notes" &&
          renderSectionFrame("notes", {
            sectionState,
            data: notes,
            onRefreshSection,
            children: (
              <>
                <div className="admin-user-note-form">
                  <textarea className="admin-field min-h-24" placeholder="ملاحظة داخلية..." value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                  <button type="button" className="admin-user-action-btn" onClick={() => { void onAddNote(noteDraft).then(() => setNoteDraft("")); }}>
                    إضافة ملاحظة
                  </button>
                </div>
                {(notes?.notes || []).length > 0 ? (
                  <>
                    <div className="mt-4 space-y-3">
                      {(notes?.notes || []).map((note) => (
                      <article key={note.id} className={`admin-user-service-tile ${note.is_pinned ? "is-pinned" : ""}`}>
                        {editingNoteId === note.id ? (
                          <>
                            <textarea
                              className="admin-field min-h-20 w-full"
                              value={editingNoteText}
                              onChange={(event) => setEditingNoteText(event.target.value)}
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="admin-user-action-btn"
                                onClick={() => {
                                  void onUpdateNote(note.id, editingNoteText).then(() => {
                                    setEditingNoteId("");
                                    setEditingNoteText("");
                                  });
                                }}
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                className="admin-user-action-btn"
                                onClick={() => {
                                  setEditingNoteId("");
                                  setEditingNoteText("");
                                }}
                              >
                                إلغاء
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-sm">{note.note}</p>
                            <p className="mt-2 text-xs text-slate-500">{note.admin_email || "مدير"} — {formatDateTime(note.created_at)}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {onTogglePinNote ? (
                                <button type="button" className="admin-user-action-btn" onClick={() => void onTogglePinNote(note.id, !note.is_pinned)}>
                                  {note.is_pinned ? "إلغاء التثبيت" : "تثبيت"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="admin-user-action-btn"
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setEditingNoteText(note.note);
                                }}
                              >
                                تعديل
                              </button>
                              <button type="button" className="admin-user-action-btn admin-user-action-btn--danger" onClick={() => {
                                if (window.confirm("حذف هذه الملاحظة؟")) void onDeleteNote(note.id);
                              }}>
                                حذف
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                    </div>
                    <PaginationBar pagination={notes?.pagination} onPageChange={(page) => onPageChange("notes", page)} />
                  </>
                ) : (
                  <div className="mt-4">
                    <SectionEmptyDataState icon="📝" />
                  </div>
                )}
              </>
            ),
          })}

        {activeTab === "management" &&
          renderSectionFrame("management", {
            sectionState,
            data: management,
            onRefreshSection,
            children: (
              <>
                {MANAGEMENT_SECTIONS.map((section) => (
                  <section key={section.title} className="admin-user-management-section admin-user-section-card admin-user-management-section--calm">
                    <h4 className="admin-user-drawer__section-title">{section.title}</h4>
                    <div className="admin-user-actions-grid mt-3">
                      {section.actions.map((item) => {
                        const selfBlocked =
                          isSelfTarget &&
                          ["suspend_user", "ban_user", "soft_delete_user", "force_logout"].includes(item.action);
                        return (
                          <button
                            key={item.action}
                            type="button"
                            disabled={Boolean(actionLoading) || selfBlocked}
                            title={selfBlocked ? "لا يمكن تنفيذ هذا الإجراء على حسابك" : undefined}
                            className={`admin-user-action-btn admin-user-action-btn--${item.tone}`}
                            onClick={() =>
                              onRequestAction({
                                ...item,
                                targetEmail: user?.email,
                                refresh: ["overview", "management", "activity"],
                              })
                            }
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}

              <div className="mt-8">
                <h4 className="admin-user-drawer__section-title">سجل التدقيق الإداري</h4>
                {renderSectionFrame("audit", {
                  sectionState,
                  data: audit,
                  onRefreshSection,
                  skeletonRows: 3,
                  children:
                    (audit?.logs || []).length > 0 ? (
                      <>
                        <div className="mt-4 space-y-3">
                          {audit.logs.map((log) => (
                            <article key={log.id} className="admin-user-service-tile">
                              <div className="flex justify-between gap-3">
                                <h5 className="font-black">{log.action}</h5>
                                <span className="text-xs font-bold">{formatDateTime(log.created_at)}</span>
                              </div>
                              <p className="mt-2 text-xs text-slate-400">
                                {log.admin_email || "مدير"} — {log.entity_type || "—"}
                                {log.entity_id ? ` #${log.entity_id}` : ""}
                              </p>
                            </article>
                          ))}
                        </div>
                        <PaginationBar
                          pagination={audit?.pagination}
                          onPageChange={(page) => onPageChange("audit", page)}
                        />
                      </>
                    ) : (
                      <div className="mt-4">
                        <SectionEmptyDataState icon="🛡️" message={audit?.message || ADMIN_SECTION_EMPTY_MESSAGE} />
                      </div>
                    ),
                })}
              </div>
            </>
            ),
          })}
      </div>
      <AdminPaymentProofModal proof={proofPreview} onClose={() => setProofPreview(null)} />
    </aside>
  );
}
