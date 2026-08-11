"use client";

const COHORTS = [
  { id: "today", label: "اليوم", icon: "✨" },
  { id: "week", label: "هذا الأسبوع", icon: "📅" },
  { id: "month", label: "هذا الشهر", icon: "🗓️" },
];

export default function AdminUsersRegistrationCohorts({
  stats,
  activeCohort = "",
  onChange,
  loading = false,
}) {
  const counts = stats?.registrationCohorts || {};

  return (
    <section className="au-panel au-panel--cohorts" aria-label="التسجيلات الجديدة">
      <div className="au-panel__head au-panel__head--flat">
        <div className="au-panel__lead">
          <span className="au-panel__icon" aria-hidden="true">
            🆕
          </span>
          <div>
            <h2 className="au-panel__title">التسجيلات الجديدة</h2>
            <p className="au-panel__subtitle">فلترة سريعة حسب فترة التسجيل — Asia/Damascus</p>
          </div>
        </div>
        {activeCohort ? (
          <button type="button" className="au-btn au-btn--compact au-btn--ghost" onClick={() => onChange?.("")}>
            إلغاء cohort
          </button>
        ) : null}
      </div>

      <div className="au-cohort-grid au-cohort-grid--3">
        {COHORTS.map((item) => {
          const isActive = activeCohort === item.id;
          const count = Number(
            counts[item.id] ??
              stats?.[`newThis${item.id === "today" ? "Today" : item.id === "week" ? "Week" : "Month"}`] ??
              0
          );

          return (
            <button
              key={item.id}
              type="button"
              className={`au-cohort-card ${isActive ? "is-active" : ""}`}
              aria-pressed={isActive}
              disabled={loading}
              onClick={() => onChange?.(item.id)}
            >
              <span className="au-cohort-card__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="au-cohort-card__label">{item.label}</span>
              <span className="au-cohort-card__value">
                {loading ? "…" : count.toLocaleString("ar")}
              </span>
              <span className="au-cohort-card__meta">{count === 1 ? "مستخدم" : "مستخدمًا"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
