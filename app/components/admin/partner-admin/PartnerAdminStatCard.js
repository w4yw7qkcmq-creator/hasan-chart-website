"use client";

export default function PartnerAdminStatCard({
  title,
  value,
  icon,
  helper,
  tone = "default",
  money = false,
}) {
  return (
    <article className={`pa-stat-card pa-stat-card--${tone}`}>
      <div className="pa-stat-card__top">
        <div className="pa-stat-card__icon" aria-hidden="true">
          {icon}
        </div>
        <p className="pa-stat-card__label">{title}</p>
      </div>
      <p className={`pa-stat-card__value ${money ? "pa-ltr" : ""}`}>{value}</p>
      {helper ? <p className="pa-stat-card__helper">{helper}</p> : null}
    </article>
  );
}
