"use client";

const STAT_CARDS = [
  { key: "total", label: "إجمالي المستخدمين", icon: "👥", tone: "neutral" },
  { key: "realUsers", label: "المستخدمون الحقيقيون", icon: "✓", tone: "success" },
  { key: "active", label: "المستخدمون النشطون", icon: "🟢", tone: "success" },
  { key: "suspended", label: "المعلقون", icon: "🟡", tone: "warning" },
  { key: "banned", label: "المحظورون", icon: "🔴", tone: "danger" },
  { key: "deleted", label: "المحذوفون", icon: "⚫", tone: "muted" },
  { key: "vipActive", label: "VIP النشط", icon: "⭐", tone: "accent" },
  { key: "expiredSubscriptions", label: "الاشتراكات المنتهية", icon: "⌛", tone: "warning" },
  { key: "priceAlertsActive", label: "التنبيهات النشطة", icon: "🔔", tone: "accent" },
];

export default function AdminUsersKpiPanel({
  stats,
  loading,
  activeCardKey = "",
  onCardClick,
}) {
  return (
    <section className="au-panel au-panel--kpis">
      <div className="au-panel__head au-panel__head--flat">
        <div className="au-panel__lead">
          <span className="au-panel__icon" aria-hidden="true">
            📊
          </span>
          <div>
            <h2 className="au-panel__title">نظرة عامة على المستخدمين</h2>
            <p className="au-panel__subtitle">مؤشرات server-authoritative — انقر لتطبيق فلتر.</p>
          </div>
        </div>
      </div>
      <div className="au-stat-grid au-stat-grid--4">
        {STAT_CARDS.map((card) => {
          const isActive = activeCardKey === card.key;
          return (
            <button
              key={card.key}
              type="button"
              className={`au-stat-card au-stat-card--${card.tone} ${isActive ? "is-active" : ""}`}
              onClick={() => onCardClick?.(card.key)}
              aria-pressed={isActive}
              disabled={loading}
            >
              <span className="au-stat-card__icon" aria-hidden="true">
                {card.icon}
              </span>
              <span className="au-stat-card__body">
                <span className="au-stat-card__label">{card.label}</span>
                <span className="au-stat-card__value">
                  {loading ? "…" : Number(stats?.[card.key] ?? 0).toLocaleString("ar")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
