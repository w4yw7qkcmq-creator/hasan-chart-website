"use client";

import { useCallback, useEffect, useState } from "react";
import { PartnerLoadingSkeleton } from "./PartnerLoadingSkeleton";

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

export function PartnerRewardsPanel({ initialRewards = null }) {
  const [rewards, setRewards] = useState(initialRewards);
  const [loading, setLoading] = useState(!initialRewards);

  const loadRewards = useCallback(async () => {
    setLoading(true);

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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialRewards) {
      void loadRewards();
    }
  }, [initialRewards, loadRewards]);

  if (loading && !rewards) {
    return (
      <section className="user-dashboard-panel">
        <div className="user-dashboard-panel__body">
          <PartnerLoadingSkeleton rows={5} />
        </div>
      </section>
    );
  }

  const achievements = rewards?.achievements || [];
  const milestones = rewards?.milestones || [];
  const notifications = rewards?.notifications || [];

  return (
    <div className="space-y-6">
      <section className="user-dashboard-panel">
        <div className="user-dashboard-panel__header">
          <div>
            <h2 className="user-dashboard-panel__title">Achievements & Badges</h2>
            <p className="user-dashboard-panel__subtitle">
              إنجازاتك داخل برنامج الشركاء — {rewards?.unreadNotifications || 0} إشعار غير مقروء
            </p>
          </div>
        </div>
        <div className="user-dashboard-panel__body">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {achievements.map((item) => (
              <div
                key={item.key}
                className={`rounded-2xl border p-4 ${
                  item.unlocked
                    ? "border-emerald-400/30 bg-emerald-500/10"
                    : "border-white/10 bg-[#07142f]/50 opacity-70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl" aria-hidden="true">
                    {item.badgeIcon}
                  </span>
                  <div>
                    <p className="font-black text-white">{item.badgeLabel}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.description}</p>
                    {item.unlocked ? (
                      <p className="mt-2 text-xs text-emerald-300">مفتوح · {formatDate(item.unlockedAt)}</p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">لم يُفتح بعد</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="user-dashboard-panel">
        <div className="user-dashboard-panel__header">
          <h2 className="user-dashboard-panel__title">Milestones</h2>
        </div>
        <div className="user-dashboard-panel__body">
          {milestones.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {milestones.map((item) => (
                <div
                  key={`${item.tierKey}-${item.milestonePercent}`}
                  className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-center"
                >
                  <p className="text-2xl font-black text-cyan-100">{item.milestonePercent}%</p>
                  <p className="mt-1 text-sm text-slate-300">{item.tierKey}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDate(item.reachedAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">ستظهر المعالم تلقائياً مع تقدمك في المستوى (25% / 50% / 75% / 100%).</p>
          )}
        </div>
      </section>

      <section className="user-dashboard-panel">
        <div className="user-dashboard-panel__header">
          <h2 className="user-dashboard-panel__title">Notifications</h2>
        </div>
        <div className="user-dashboard-panel__body space-y-3">
          {notifications.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl border px-4 py-3 ${
                item.isRead ? "border-white/10 bg-[#07142f]/40" : "border-cyan-400/20 bg-cyan-500/10"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">{item.title}</p>
                <span className="text-xs text-slate-400">{formatDate(item.createdAt)}</span>
              </div>
              {item.body ? <p className="mt-2 text-sm text-slate-300">{item.body}</p> : null}
              <p className="mt-1 text-xs font-mono text-slate-500">{item.type}</p>
            </article>
          ))}
          {!notifications.length ? (
            <p className="text-slate-400">لا توجد إشعارات بعد — ستصل تلقائياً عند الترقية أو العمولات أو المكافآت.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
