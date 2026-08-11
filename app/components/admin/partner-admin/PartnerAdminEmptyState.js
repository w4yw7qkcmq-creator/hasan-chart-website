"use client";

export default function PartnerAdminEmptyState({
  icon = "📭",
  title,
  description,
  action = null,
  className = "",
}) {
  return (
    <div className={`pa-empty ${className}`.trim()}>
      <div className="pa-empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="pa-empty__title">{title}</h3>
      {description ? <p className="pa-empty__desc">{description}</p> : null}
      {action ? <div className="pa-empty__action">{action}</div> : null}
    </div>
  );
}
