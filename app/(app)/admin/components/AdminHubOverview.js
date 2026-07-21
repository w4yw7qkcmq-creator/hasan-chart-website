"use client";

import dynamic from "next/dynamic";
import AdminHubHero from "./AdminHubHero";
import AdminHubLiveStatus from "./AdminHubLiveStatus";
import AdminHubNavigation from "./AdminHubNavigation";
import AdminHubUrgentQueue from "./AdminHubUrgentQueue";

const AdminActivityFeed = dynamic(() => import("./AdminActivityFeed"), {
  ssr: false,
  loading: () => (
    <section className="admin-section animate-pulse p-6">
      <div className="h-6 w-48 rounded bg-slate-200/60" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-14 rounded-xl bg-slate-200/40" />
        ))}
      </div>
    </section>
  ),
});

export default function AdminHubOverview({
  user,
  stats,
  statsPending,
  statsError,
  onRetryStats,
  lastUpdatedAt,
  isRefreshing,
  adminUnreadCount,
  onRefresh,
  onOpenCommandPalette,
  onToggleNotifications,
  onLogout,
  notificationsWrapperRef,
  notificationsButtonRef,
  onNavigateTab,
  urgentItems,
  urgentLoading,
  onOpenUrgentItem,
  activityEvents,
  activityLoading,
  activityError,
  activityPartialFailure,
  activityAllSourcesFailed,
  activityRefreshing,
  onActivityRefresh,
  onOpenActivityEvent,
}) {
  const visibleEvents = (activityEvents || []).slice(0, 10);
  const enrichedStats = {
    ...stats,
    adminUnreadCount,
  };

  return (
    <div className="admin-hub-overview space-y-5 admin-animate-in">
      <AdminHubHero
        user={user}
        lastUpdatedAt={lastUpdatedAt}
        isRefreshing={isRefreshing}
        serverOnline={!statsError}
        adminUnreadCount={adminUnreadCount}
        onRefresh={onRefresh}
        onOpenCommandPalette={onOpenCommandPalette}
        onToggleNotifications={onToggleNotifications}
        onLogout={onLogout}
        notificationsWrapperRef={notificationsWrapperRef}
        notificationsButtonRef={notificationsButtonRef}
      />

      <AdminHubLiveStatus stats={enrichedStats} loading={statsPending} />

      {statsError ? (
        <div className="admin-premium-empty admin-premium-empty--warn admin-section">
          <p className="admin-premium-empty__title">تعذر تحميل بعض المؤشرات</p>
          <p className="admin-premium-empty__desc">{statsError}</p>
          <button type="button" className="admin-btn-surface mt-3 px-4 py-2" onClick={onRetryStats}>
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      <AdminHubNavigation stats={enrichedStats} onNavigateTab={onNavigateTab} />

      <AdminHubUrgentQueue items={urgentItems} loading={urgentLoading} onOpenItem={onOpenUrgentItem} />

      <div id="admin-activity-feed">
        {activityLoading ? (
          <AdminActivityFeed loading />
        ) : (
          <AdminActivityFeed
            events={visibleEvents}
            error={activityError}
            partialFailure={activityPartialFailure || Boolean(activityError)}
            allSourcesFailed={activityAllSourcesFailed}
            refreshing={activityRefreshing}
            onRefresh={onActivityRefresh}
            onOpenEvent={onOpenActivityEvent}
          />
        )}
      </div>
    </div>
  );
}
