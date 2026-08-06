"use client";
import { formatRelativeTimeArabic } from "../../../../lib/admin-command-palette-helpers";
const EVENT_TONE_CLASS = {
  user_registered: "tone-user",
  analysis_request: "tone-analysis",
  subscription_request: "tone-subscription",
  subscription_activated: "tone-subscription",
  account_request: "tone-account",
  price_alert: "tone-alert",
  vip_signal: "tone-vip",
  admin_action: "tone-admin",
};
function resolveEventTone(event) {
  return EVENT_TONE_CLASS[event?.type] || "tone-default";
}
function ActivityFeedSkeleton() {
  return (
    <div className="admin-activity-feed__skeleton">
      {" "}
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="admin-activity-feed__skeleton-row animate-pulse"
        >
          {" "}
          <div className="h-11 w-11 rounded-xl bg-slate-200/50" />{" "}
          <div className="flex-1 space-y-2">
            {" "}
            <div className="h-4 w-2/3 rounded bg-slate-200/60" />{" "}
            <div className="h-3 w-1/3 rounded bg-slate-200/40" />{" "}
          </div>{" "}
        </div>
      ))}{" "}
    </div>
  );
}
export default function AdminActivityFeed({
  events = [],
  loading = false,
  error = "",
  partialFailure = false,
  allSourcesFailed = false,
  refreshing = false,
  onRefresh,
  onOpenEvent,
}) {
  const showSoftWarning = Boolean(error) || partialFailure || allSourcesFailed;
  return (
    <section className="order-4 admin-section admin-activity-feed admin-activity-feed--premium p-5 md:p-6">
      {" "}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        {" "}
        <div>
          {" "}
          <h2 className="admin-heading text-2xl">آخر نشاطات المنصة</h2>{" "}
          <p className="mt-2 text-sm font-bold admin-activity-feed__desc">
            {" "}
            أحدث الأحداث المهمة من مصادر المنصة المختلفة.{" "}
          </p>{" "}
        </div>{" "}
        <div className="flex flex-wrap items-center gap-2">
          {" "}
          {refreshing ? (
            <span className="admin-activity-feed__badge admin-activity-feed__badge--info">
              ⟳ تحديث
            </span>
          ) : null}{" "}
          {showSoftWarning ? (
            <span className="admin-activity-feed__badge admin-activity-feed__badge--warn">
              {" "}
              بعض مصادر النشاط غير متوفرة حالياً.{" "}
            </span>
          ) : null}{" "}
          <button
            type="button"
            onClick={onRefresh}
            className="admin-btn-surface px-4 py-2 text-xs font-black"
          >
            {" "}
            تحديث النشاط{" "}
          </button>{" "}
        </div>{" "}
      </div>{" "}
      {loading ? (
        <div className="mt-5">
          {" "}
          <ActivityFeedSkeleton />{" "}
        </div>
      ) : events.length === 0 ? (
        <div className="admin-premium-empty mt-5">
          {" "}
          <span className="admin-premium-empty__icon" aria-hidden="true">
            {" "}
            🕒{" "}
          </span>{" "}
          <p className="admin-premium-empty__title">
            لا توجد نشاطات حديثة
          </p>{" "}
          <p className="admin-premium-empty__desc">
            ستظهر هنا أحداث المستخدمين والإدارة فور حدوثها.
          </p>{" "}
          {showSoftWarning ? (
            <button
              type="button"
              className="admin-btn-surface mt-4 px-5 py-3"
              onClick={onRefresh}
            >
              {" "}
              إعادة المحاولة{" "}
            </button>
          ) : null}{" "}
        </div>
      ) : (
        <div className="admin-activity-feed__list mt-5">
          {" "}
          {events.map((event) => {
            const fullDate = event.occurredAt
              ? new Date(event.occurredAt).toLocaleString("ar")
              : "—";
            const clickable = Boolean(
              event.tab || event.href || event.targetUserId,
            );
            const toneClass = resolveEventTone(event);
            return (
              <button
                key={event.id}
                type="button"
                className={`admin-activity-feed__item admin-activity-feed__item--premium ${toneClass} ${clickable ? "admin-activity-feed__item--clickable" : ""}`}
                onClick={() => {
                  if (clickable) onOpenEvent?.(event);
                }}
                title={fullDate}
                disabled={!clickable}
              >
                {" "}
                <span className="admin-activity-feed__icon" aria-hidden="true">
                  {" "}
                  {event.icon}{" "}
                </span>{" "}
                <div className="min-w-0 flex-1 text-right">
                  {" "}
                  <p className="admin-activity-feed__title">
                    {event.title}
                  </p>{" "}
                  <p className="admin-activity-feed__meta">
                    {" "}
                    {event.actorLabel ? `${event.actorLabel}` : "—"}{" "}
                    {event.meta ? ` · ${event.meta}` : ""}{" "}
                  </p>{" "}
                </div>{" "}
                <span className="admin-activity-feed__time">
                  {formatRelativeTimeArabic(event.occurredAt)}
                </span>{" "}
              </button>
            );
          })}{" "}
        </div>
      )}{" "}
    </section>
  );
}
