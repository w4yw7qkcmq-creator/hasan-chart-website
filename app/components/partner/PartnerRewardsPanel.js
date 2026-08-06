"use client";
import { useCallback, useEffect, useState } from "react";
import { tierNameLabel } from "../../../lib/partner-shared";
import { PartnerLoadingSkeleton } from "./PartnerLoadingSkeleton";
import { useVisibilityRefresh } from "../../hooks/useVisibilityRefresh";
const SECTION_ICONS = {
  achievements: "🏅",
  milestones: "🎯",
  notifications: "🔔",
};
const PARTNER_NOTIFICATION_TYPE_LABELS = {
  tier_upgraded: "ترقية المستوى",
  commission_released: "إطلاق عمولة",
  withdraw_paid: "تم دفع السحب",
  bonus_received: "مكافأة مستلمة",
  achievement_unlocked: "إنجاز جديد",
  leaderboard_changed: "تغيّر الترتيب",
  withdrawal_created: "طلب سحب جديد",
  withdrawal_approved: "قبول طلب السحب",
  withdrawal_rejected: "رفض طلب السحب",
};
function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
function formatNotificationType(type) {
  const key = String(type || "")
    .trim()
    .toLowerCase();
  return PARTNER_NOTIFICATION_TYPE_LABELS[key] || type || "إشعار";
}
export function PartnerRewardsPanel({ initialRewards = null }) {
  const [rewards, setRewards] = useState(initialRewards);
  const [loading, setLoading] = useState(!initialRewards);
  const loadRewards = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/partner/rewards", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.success) {
        setRewards(result.rewards);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    if (!initialRewards) {
      void loadRewards();
    }
  }, [initialRewards, loadRewards]);
  useVisibilityRefresh(() => loadRewards({ silent: true }), {
    intervalMs: 30000,
    refreshOnFocus: true,
  });
  if (loading && !rewards) {
    return (
      <section className="user-dashboard-panel" dir="rtl">
        {" "}
        <div className="user-dashboard-panel__body">
          {" "}
          <PartnerLoadingSkeleton rows={5} />{" "}
        </div>{" "}
      </section>
    );
  }
  const achievements = rewards?.achievements || [];
  const milestones = rewards?.milestones || [];
  const notifications = rewards?.notifications || [];
  return (
    <div className="space-y-6" dir="rtl">
      {" "}
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__header">
          {" "}
          <div>
            {" "}
            <h2 className="user-dashboard-panel__title">
              {" "}
              <span className="ml-2" aria-hidden="true">
                {" "}
                {SECTION_ICONS.achievements}{" "}
              </span>{" "}
              الإنجازات والشارات{" "}
            </h2>{" "}
            <p className="user-dashboard-panel__subtitle">
              {" "}
              إنجازاتك داخل برنامج الشركاء — {rewards?.unreadNotifications ||
                0}{" "}
              إشعار غير مقروء{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
        <div className="user-dashboard-panel__body">
          {" "}
          <div className="partner-scroll-panel partner-scroll-panel--list">
            {" "}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {" "}
              {achievements.map((item) => (
                <div
                  key={item.key}
                  className={`partner-surface partner-surface--p4 ${item.unlocked ? "partner-surface--unlocked" : "partner-surface--locked"}`}
                >
                  {" "}
                  <div className="flex items-start gap-3">
                    {" "}
                    <span
                      className="partner-achievement-card__icon"
                      aria-hidden="true"
                    >
                      {" "}
                      {item.badgeIcon}{" "}
                    </span>{" "}
                    <div>
                      {" "}
                      <p className="partner-achievement-card__title">
                        {item.badgeLabel}
                      </p>{" "}
                      <p className="partner-achievement-card__desc">
                        {item.description}
                      </p>{" "}
                      {item.unlocked ? (
                        <p className="partner-unlocked-meta">
                          مفتوح — {formatDate(item.unlockedAt)}
                        </p>
                      ) : (
                        <p className="partner-locked-meta">لم يُفتح بعد</p>
                      )}{" "}
                    </div>{" "}
                  </div>{" "}
                </div>
              ))}{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
      </section>{" "}
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__header">
          {" "}
          <h2 className="user-dashboard-panel__title">
            {" "}
            <span className="ml-2" aria-hidden="true">
              {" "}
              {SECTION_ICONS.milestones}{" "}
            </span>{" "}
            المعالم{" "}
          </h2>{" "}
        </div>{" "}
        <div className="user-dashboard-panel__body">
          {" "}
          {milestones.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {" "}
              {milestones.map((item) => (
                <div
                  key={`${item.tierKey}-${item.milestonePercent}`}
                  className="partner-surface partner-surface--p4 partner-surface--cyan partner-milestone-card"
                >
                  {" "}
                  <p className="partner-accent-cyan">
                    {item.milestonePercent}٪
                  </p>{" "}
                  <p className="partner-muted mt-1 text-sm">
                    {tierNameLabel(item.tierKey)}
                  </p>{" "}
                  <p className="partner-muted--sm mt-2">
                    {formatDate(item.reachedAt)}
                  </p>{" "}
                </div>
              ))}{" "}
            </div>
          ) : (
            <p className="partner-muted">
              {" "}
              ستظهر المعالم تلقائياً مع تقدمك في المستوى (٢٥٪ / ٥٠٪ / ٧٥٪ /
              ١٠٠٪).{" "}
            </p>
          )}{" "}
        </div>{" "}
      </section>{" "}
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__header">
          {" "}
          <h2 className="user-dashboard-panel__title">
            {" "}
            <span className="ml-2" aria-hidden="true">
              {" "}
              {SECTION_ICONS.notifications}{" "}
            </span>{" "}
            الإشعارات{" "}
          </h2>{" "}
        </div>{" "}
        <div className="user-dashboard-panel__body space-y-3">
          {" "}
          <div className="partner-scroll-panel partner-scroll-panel--list space-y-3">
            {" "}
            {notifications.map((item) => (
              <article
                key={item.id}
                className={`partner-surface partner-surface--p4 ${item.isRead ? "partner-surface--read" : "partner-surface--unread"}`}
              >
                {" "}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {" "}
                  <p className="partner-notification-card__title">
                    {item.title}
                  </p>{" "}
                  <span className="partner-muted--sm">
                    {formatDate(item.createdAt)}
                  </span>{" "}
                </div>{" "}
                {item.body ? (
                  <p className="partner-notification-card__body">{item.body}</p>
                ) : null}{" "}
                <p className="partner-notification-type">
                  {formatNotificationType(item.type)}
                </p>{" "}
              </article>
            ))}{" "}
          </div>{" "}
          {!notifications.length ? (
            <p className="partner-muted">
              {" "}
              لا توجد إشعارات بعد — ستصل تلقائياً عند الترقية أو العمولات أو
              المكافآت.{" "}
            </p>
          ) : null}{" "}
        </div>{" "}
      </section>{" "}
    </div>
  );
}
