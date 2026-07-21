"use client";

function resolveAdminRole(user) {
  const role = String(user?.role || user?.user_metadata?.role || "admin").trim();
  if (role === "super_admin") return "مدير عام";
  if (role === "admin") return "مدير";
  if (role === "accountant") return "محاسب";
  return role || "مدير";
}

export default function AdminHubHero({
  user,
  lastUpdatedAt = "",
  isRefreshing = false,
  serverOnline = true,
  adminUnreadCount = 0,
  onRefresh,
  onOpenCommandPalette,
  onToggleNotifications,
  onLogout,
  notificationsWrapperRef,
  notificationsButtonRef,
}) {
  const displayName =
    user?.username ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "المدير";

  const serverLabel = isRefreshing ? "جاري المزامنة" : serverOnline ? "السيرفر متصل" : "تحقق من الاتصال";
  const serverClass = isRefreshing ? "is-sync" : serverOnline ? "is-online" : "is-offline";

  return (
    <header className="admin-hub-hero admin-hub-hero--premium admin-section">
      <div className="admin-hub-hero__main">
        <div className="admin-hub-hero__intro">
          <p className="admin-hub-hero__eyebrow">HasaN CharT World · Admin</p>
          <h1 className="admin-heading text-3xl md:text-4xl">لوحة التحكم</h1>
          <p className="admin-hub-hero__desc">
            مركز إدارة المنصة — المستخدمون، المالية، الطلبات، والنشاط في مكان واحد.
          </p>
          <div className="admin-hub-hero__admin-meta">
            <div className="admin-hub-hero__admin-chip">
              <span className="admin-hub-hero__admin-label">المدير الحالي</span>
              <span className="admin-hub-hero__admin-name">{displayName}</span>
              <span className="admin-hub-hero__admin-role">{resolveAdminRole(user)}</span>
            </div>
          </div>
        </div>

        <div className="admin-hub-hero__actions">
          <button type="button" className="admin-btn-surface px-4 py-2" onClick={onOpenCommandPalette} title="⌘K">
            ⌘K أوامر
          </button>
          <div className="relative" ref={notificationsWrapperRef}>
            <button
              type="button"
              ref={notificationsButtonRef}
              className="admin-btn-surface px-4 py-2 relative"
              onClick={onToggleNotifications}
            >
              🔔 إشعارات
              {adminUnreadCount > 0 ? (
                <span className="admin-hub-hero__badge">{adminUnreadCount}</span>
              ) : null}
            </button>
          </div>
          <button type="button" className="admin-btn-surface px-4 py-2" onClick={onLogout}>
            خروج
          </button>
        </div>
      </div>

      <div className="admin-hub-hero__status-bar">
        <div className="admin-hub-hero__status-items">
          <span className={`admin-hub-hero__server ${serverClass}`}>{serverLabel}</span>
          <span className="admin-hub-hero__updated">
            {isRefreshing ? "جاري التحديث..." : lastUpdatedAt ? `آخر تحديث: ${lastUpdatedAt}` : "بانتظار أول تحديث"}
          </span>
        </div>
        <button type="button" className="admin-hub-hero__refresh" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? "⟳ تحديث..." : "تحديث البيانات"}
        </button>
      </div>
    </header>
  );
}
