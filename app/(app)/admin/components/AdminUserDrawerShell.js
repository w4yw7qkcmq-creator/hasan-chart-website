"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

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
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-14 rounded-2xl bg-white/10" />
      ))}
    </div>
  );
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

const MANAGEMENT_ACTIONS = [
  { action: "suspend_user", label: "تعليق الحساب", tone: "warning", title: "تعليق الحساب", description: "سيتم تعليق وصول المستخدم إلى الخدمات المحمية وإنهاء جلساته.", confirmLabel: "تأكيد التعليق", requireReason: true },
  { action: "unsuspend_user", label: "رفع التعليق", tone: "neutral", title: "رفع التعليق", description: "استعادة وصول المستخدم.", confirmLabel: "تأكيد" },
  { action: "ban_user", label: "حظر المستخدم", tone: "danger", title: "حظر المستخدم", description: "منع تسجيل الدخول عبر Auth ban.", confirmLabel: "تأكيد الحظر", dangerous: true },
  { action: "unban_user", label: "إلغاء الحظر", tone: "neutral", title: "إلغاء الحظر", description: "إزالة الحظر عن المستخدم.", confirmLabel: "تأكيد" },
  { action: "soft_delete_user", label: "Soft Delete", tone: "danger", title: "حذف الحساب (Soft Delete)", description: "لن يتم حذف auth.users. لن تُحذف بيانات الطلبات والاشتراكات. سيتم منع الحساب من استخدام المنصة ويمكن استعادته لاحقًا.", confirmLabel: "تأكيد Soft Delete", dangerous: true },
  { action: "restore_user", label: "استعادة الحساب", tone: "success", title: "استعادة الحساب", description: "إعادة تفعيل حساب محذوف/موقوف.", confirmLabel: "تأكيد الاستعادة" },
  { action: "force_logout", label: "تسجيل خروج شامل", tone: "warning", title: "تسجيل خروج من جميع الأجهزة", description: "إنهاء جميع الجلسات النشطة.", confirmLabel: "تأكيد" },
  { action: "password_reset_requested", label: "إرسال رابط إعادة كلمة المرور", tone: "neutral", title: "إعادة تعيين كلمة المرور", description: "إنشاء رابط است recovery عبر Supabase Admin.", confirmLabel: "تأكيد الإرسال" },
];

export default function AdminUserDrawerShell({
  activeTab,
  tabs,
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
  currentAdminUserId,
  onPageChange,
  onRefreshSection,
  onRequestAction,
  onRunAction,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}) {
  const user = overview?.user;
  const [noteDraft, setNoteDraft] = useState("");
  const [manualExpiry, setManualExpiry] = useState("");

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

  const renderSectionError = (section) =>
    sectionState?.[section]?.error ? (
      <div className="text-center">
        <p className="font-black text-red-200">{sectionState[section].error}</p>
        <button type="button" className="admin-btn-surface mt-4 px-5 py-3" onClick={() => onRefreshSection(section)}>
          إعادة المحاولة
        </button>
      </div>
    ) : null;

  return (
    <aside className="admin-user-drawer admin-user-drawer--wide" aria-label="إدارة المستخدم">
      <div className="admin-user-drawer__header">
        <div>
          <p className="admin-user-hero__eyebrow">مركز تحكم المستخدم</p>
          <h3 className="admin-heading text-2xl">{user?.username || user?.email || "المستخدم"}</h3>
        </div>
        <button type="button" className="admin-user-drawer__close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="admin-user-drawer__tabs admin-user-drawer__tabs--scroll" role="tablist">
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

      <div className="admin-user-drawer__body">
        {activeTab === "overview" &&
          (sectionState?.overview?.loading && !overview ? (
            <SectionSkeleton rows={8} />
          ) : renderSectionError("overview") || <UserHeroCard user={user} stats={overview?.stats} />)}

        {activeTab === "services" &&
          (sectionState?.services?.loading && !services ? (
            <SectionSkeleton />
          ) : renderSectionError("services") || (
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
          ))}

        {activeTab === "subscriptions" &&
          (sectionState?.subscriptions?.loading && !subscriptions ? (
            <SectionSkeleton rows={6} />
          ) : renderSectionError("subscriptions") || (
            <>
              <div className="admin-user-services-grid">
                {(subscriptions?.subscriptions || []).map((sub) => (
                  <article key={sub.id} className="admin-user-service-tile">
                    <div className="admin-user-service-tile__head">
                      <div>
                        <h5 className="font-black">{sub.serviceName}</h5>
                        <p className="text-xs text-slate-400">{sub.planName} — {sub.category}</p>
                      </div>
                      <span className="admin-user-service-tile__badge is-active">{sub.status}</span>
                    </div>
                    <div className="admin-user-service-tile__dates">
                      <p><span>البداية</span><strong>{formatDateTime(sub.startedAt)}</strong></p>
                      <p><span>الانتهاء</span><strong>{formatDateTime(sub.endsAt)}</strong></p>
                      <p><span>المصدر</span><strong>{sub.activationSource}</strong></p>
                      <p><span>تجديد تلقائي</span><strong>{sub.autoRenew ? "نعم" : "لا"}</strong></p>
                    </div>
                    <div className="admin-user-actions-grid">
                      {subscriptionActions.map((item) => (
                        <button
                          key={`${sub.id}-${item.label}`}
                          type="button"
                          disabled={Boolean(actionLoading)}
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
                      />
                      <button
                        type="button"
                        className="admin-user-action-btn"
                        disabled={Boolean(actionLoading)}
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
                  </article>
                ))}
              </div>
              <PaginationBar
                pagination={subscriptions?.pagination}
                onPageChange={(page) => onPageChange("subscriptions", page)}
              />
            </>
          ))}

        {activeTab === "payments" &&
          (sectionState?.payments?.loading && !payments ? (
            <SectionSkeleton />
          ) : renderSectionError("payments") || (
            <div className="admin-user-empty-state">
              <span>💰</span>
              <p>{payments?.message || "لا توجد مدفوعات مسجلة لهذا المستخدم."}</p>
            </div>
          ))}

        {activeTab === "notifications" &&
          (sectionState?.notifications?.loading && !notifications ? (
            <SectionSkeleton />
          ) : renderSectionError("notifications") || (
            <>
              <div className="admin-user-note-form">
                <p className="text-sm text-slate-400">إرسال إشعار خاص — Placeholder (المرحلة 3C)</p>
              </div>
              <div className="mt-4 space-y-3">
                {(notifications?.notifications || []).map((row) => (
                  <article key={row.id} className="admin-user-service-tile">
                    <div className="flex justify-between gap-3">
                      <h5 className="font-black">{row.title}</h5>
                      <span className="text-xs font-bold">{row.isRead ? "مقروء" : "غير مقروء"}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{row.message}</p>
                    <p className="mt-2 text-xs text-slate-500">{row.type} — {formatDateTime(row.createdAt)}</p>
                  </article>
                ))}
              </div>
              <PaginationBar pagination={notifications?.pagination} onPageChange={(page) => onPageChange("notifications", page)} />
            </>
          ))}

        {activeTab === "emails" &&
          (sectionState?.emails?.loading && !emails ? (
            <SectionSkeleton />
          ) : renderSectionError("emails") || (
            <>
              <div className="space-y-3">
                {(emails?.emails || []).map((row) => (
                  <article key={row.id} className="admin-user-service-tile">
                    <div className="flex justify-between gap-3">
                      <h5 className="font-black">{row.subject || row.messageType}</h5>
                      <span className="text-xs font-bold">{row.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {row.messageType} — {formatDateTime(row.createdAt)} — {row.sentAt ? `أُرسل: ${formatDateTime(row.sentAt)}` : "لم يُرسل بعد"}
                    </p>
                    {row.error ? <p className="mt-1 text-xs text-red-300">{row.error}</p> : null}
                    <button
                      type="button"
                      disabled
                      className="admin-user-action-btn mt-3 opacity-60"
                      title="Placeholder — لا يوجد مسار retry آمن حالياً"
                    >
                      إعادة محاولة (Placeholder)
                    </button>
                  </article>
                ))}
              </div>
              <PaginationBar pagination={emails?.pagination} onPageChange={(page) => onPageChange("emails", page)} />
            </>
          ))}

        {activeTab === "activity" &&
          (sectionState?.activity?.loading && !activity ? (
            <SectionSkeleton rows={6} />
          ) : renderSectionError("activity") || (
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
          ))}

        {activeTab === "notes" &&
          (sectionState?.notes?.loading && !notes ? (
            <SectionSkeleton />
          ) : renderSectionError("notes") || (
            <>
              {notes?.available === false ? (
                <div className="admin-user-empty-state"><p>{notes.message}</p></div>
              ) : (
                <>
                  <div className="admin-user-note-form">
                    <textarea className="admin-field min-h-24" placeholder="ملاحظة داخلية..." value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                    <button type="button" className="admin-user-action-btn" onClick={() => { void onAddNote(noteDraft).then(() => setNoteDraft("")); }}>
                      إضافة ملاحظة
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(notes?.notes || []).map((note) => (
                      <article key={note.id} className="admin-user-service-tile">
                        <p className="text-sm">{note.note}</p>
                        <p className="mt-2 text-xs text-slate-500">{note.admin_email || "مدير"} — {formatDateTime(note.created_at)}</p>
                        <div className="mt-3 flex gap-2">
                          <button type="button" className="admin-user-action-btn" onClick={() => {
                            const next = window.prompt("تعديل الملاحظة", note.note);
                            if (next) void onUpdateNote(note.id, next);
                          }}>
                            تعديل
                          </button>
                          <button type="button" className="admin-user-action-btn admin-user-action-btn--danger" onClick={() => {
                            if (window.confirm("حذف هذه الملاحظة؟")) void onDeleteNote(note.id);
                          }}>
                            حذف
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <PaginationBar pagination={notes?.pagination} onPageChange={(page) => onPageChange("notes", page)} />
                </>
              )}
            </>
          ))}

        {activeTab === "management" &&
          (sectionState?.management?.loading && !management ? (
            <SectionSkeleton />
          ) : renderSectionError("management") || (
            <>
              <div className="admin-user-actions-grid">
              {MANAGEMENT_ACTIONS.map((item) => {
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

              <div className="mt-8">
                <h4 className="admin-user-drawer__section-title">سجل التدقيق الإداري</h4>
                {sectionState?.audit?.loading && !audit ? (
                  <SectionSkeleton rows={3} />
                ) : (
                  <div className="mt-4 space-y-3">
                    {(audit?.logs || []).length ? (
                      audit.logs.map((log) => (
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
                      ))
                    ) : (
                      <div className="admin-user-empty-state">
                        <p>{audit?.message || "لا توجد سجلات تدقيق بعد."}</p>
                      </div>
                    )}
                  </div>
                )}
                <PaginationBar
                  pagination={audit?.pagination}
                  onPageChange={(page) => onPageChange("audit", page)}
                />
              </div>
            </>
          ))}
      </div>
    </aside>
  );
}
