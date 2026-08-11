"use client";

export default function PartnerAdminSection({
  title,
  description,
  actions = null,
  children,
  className = "",
  surface = true,
}) {
  return (
    <section className={`pa-section admin-animate-in ${className}`.trim()}>
      {title || description || actions ? (
        <header className="pa-section__head">
          <div className="pa-section__titles">
            {title ? <h2 className="pa-section__title">{title}</h2> : null}
            {description ? <p className="pa-section__desc">{description}</p> : null}
          </div>
          {actions ? <div className="pa-section__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={surface ? "pa-surface" : "pa-section__body"}>{children}</div>
    </section>
  );
}
