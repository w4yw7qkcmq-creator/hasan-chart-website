"use client";

const STAT_CARDS = [
  { key: "total", label: "إجمالي المستخدمين", icon: "👥", filterHint: "عرض جميع المستخدمين" },
  { key: "active", label: "المستخدمون النشطون", icon: "🟢", filterHint: "تصفية: نشط" },
  { key: "suspended", label: "المعلقون", icon: "🟡", filterHint: "تصفية: معلق" },
  { key: "banned", label: "المحظورون", icon: "🔴", filterHint: "تصفية: محظور" },
  { key: "deleted", label: "Soft Deleted", icon: "⚫", filterHint: "تصفية: محذوف" },
  { key: "vipActive", label: "VIP Active", icon: "⭐", filterHint: "تصفية: VIP نشط" },
  {
    key: "accountManagementActive",
    label: "Account Management Active",
    icon: "📂",
    filterHint: "تصفية: إدارة حسابات نشطة",
  },
  { key: "priceAlertsActive", label: "Price Alerts Active", icon: "🔔", filterHint: "تصفية: تنبيهات نشطة" },
  { key: "expiredSubscriptions", label: "الاشتراكات المنتهية", icon: "⌛", filterHint: "تصفية: اشتراكات منتهية" },
  { key: "newToday", label: "جدد اليوم", icon: "✨", filterHint: "تصفية: مسجلون اليوم" },
  { key: "newThisWeek", label: "جدد هذا الأسبوع", icon: "📅", filterHint: "تصفية: مسجلون هذا الأسبوع" },
];

export default function AdminUserManagementDashboard({
  stats,
  loading,
  activeCardKey = "",
  onCardClick,
}) {
  return (
    <section className="admin-user-dashboard">
      <div className="admin-user-dashboard__head">
        <div>
          <p className="admin-user-hero__eyebrow">لوحة المؤشرات</p>
          <h3 className="admin-heading text-xl">نظرة عامة على المستخدمين</h3>
        </div>
        {stats?.scanComplete === false ? (
          <span className="admin-user-dashboard__hint">مؤشرات الخدمات من عينة {stats?.scannedSampleSize || 0} مستخدم</span>
        ) : (
          <span className="admin-user-dashboard__hint">انقر على بطاقة لتطبيق الفلتر مباشرة</span>
        )}
      </div>

      <div className="admin-user-dashboard__grid">
        {STAT_CARDS.map((card) => {
          const isActive = activeCardKey === card.key;

          return (
            <button
              key={card.key}
              type="button"
              className={`admin-user-dashboard__card admin-user-dashboard__card--clickable ${isActive ? "is-active" : ""}`}
              onClick={() => onCardClick?.(card.key)}
              title={card.filterHint}
              aria-pressed={isActive}
              disabled={loading}
            >
              <div className="admin-user-dashboard__card-icon" aria-hidden="true">
                {card.icon}
              </div>
              <div>
                <p className="admin-user-dashboard__card-label">{card.label}</p>
                <p className="admin-user-dashboard__card-value">
                  {loading ? "…" : Number(stats?.[card.key] ?? 0).toLocaleString("ar")}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
