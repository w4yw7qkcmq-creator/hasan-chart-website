"use client";

export default function PartnerAdminSection({
  title,
  description,
  icon = null,
  actions = null,
  children,
  className = "",
  surface = true,
  variant = "default",
}) {
  const header =
    title || description || actions || icon ? (
      <header className={`pa-section__head ${variant === "panel" ? "pa-section__head--panel" : ""}`.trim()}>
        {icon ? <span className="pa-section__icon" aria-hidden="true">{icon}</span> : null}
        <div className="pa-section__titles">
          {title ? <h2 className="pa-section__title">{title}</h2> : null}
          {description ? <p className="pa-section__desc">{description}</p> : null}
        </div>
        {actions ? <div className="pa-section__actions">{actions}</div> : null}
      </header>
    ) : null;

  if (variant === "panel") {
    return (
      <section className={`pa-section pa-section--panel ${className}`.trim()}>
        <div className="pa-section__panel">
          {header}
          <div className="pa-section__body">{children}</div>
        </div>
      </section>
    );
  }

  return (
    <section className={`pa-section admin-animate-in ${className}`.trim()}>
      {header}
      <div className={surface ? "pa-surface" : "pa-section__body"}>{children}</div>
    </section>
  );
}
