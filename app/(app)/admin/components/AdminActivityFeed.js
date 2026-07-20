"use client";

import { formatRelativeTimeArabic } from "../../../../lib/admin-command-palette-helpers";

function ActivityFeedSkeleton() {
  return (
    <div className="admin-activity-feed__skeleton">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="admin-activity-feed__skeleton-row animate-pulse">
          <div className="h-10 w-10 rounded-xl bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-white/15" />
            <div className="h-3 w-1/3 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminActivityFeed({
  events = [],
  loading = false,
  error = "",
  partialFailure = false,
  refreshing = false,
  onRefresh,
  onOpenEvent,
}) {
  return (
    <section className="order-4 admin-section admin-activity-feed p-5 md:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="admin-heading text-2xl">آخر نشاطات المنصة</h2>
          <p className="mt-2 text-sm font-bold text-slate-600">
            أحدث {events.length} حدثًا مهمًا من مصادر المنصة المختلفة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing ? (
            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">
              ⟳ تحديث
            </span>
          ) : null}
          {partialFailure ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-100">
              بعض المصادر غير متاحة
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200 transition hover:bg-cyan-400/20"
          >
            تحديث النشاط
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-5">
          <ActivityFeedSkeleton />
        </div>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-red-300/20 bg-red-500/10 p-6 text-center">
          <p className="font-black text-red-100">{error}</p>
          <button type="button" className="admin-btn-surface mt-4 px-5 py-3" onClick={onRefresh}>
            إعادة المحاولة
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-400/5 p-10 text-center">
          <p className="text-3xl">🕒</p>
          <p className="mt-3 font-black">لا توجد نشاطات حديثة حالياً</p>
          <p className="mt-2 text-sm font-bold text-slate-500">ستظهر هنا أحداث المستخدمين والإدارة فور حدوثها.</p>
        </div>
      ) : (
        <div className="admin-activity-feed__list mt-5">
          {events.map((event) => {
            const fullDate = event.occurredAt
              ? new Date(event.occurredAt).toLocaleString("ar")
              : "—";
            const clickable = Boolean(event.tab || event.href || event.targetUserId);

            return (
              <button
                key={event.id}
                type="button"
                className={`admin-activity-feed__item ${clickable ? "admin-activity-feed__item--clickable" : ""}`}
                onClick={() => {
                  if (clickable) onOpenEvent?.(event);
                }}
                title={fullDate}
                disabled={!clickable}
              >
                <span className="admin-activity-feed__icon" aria-hidden="true">
                  {event.icon}
                </span>
                <div className="min-w-0 flex-1 text-right">
                  <p className="admin-activity-feed__title">{event.title}</p>
                  <p className="admin-activity-feed__meta">
                    {event.actorLabel ? `${event.actorLabel}` : "—"}
                    {event.meta ? ` · ${event.meta}` : ""}
                  </p>
                </div>
                <span className="admin-activity-feed__time">{formatRelativeTimeArabic(event.occurredAt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
