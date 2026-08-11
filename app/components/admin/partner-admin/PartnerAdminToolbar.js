"use client";

export default function PartnerAdminToolbar({ children, className = "" }) {
  return <div className={`pa-toolbar ${className}`.trim()}>{children}</div>;
}

export function PartnerAdminField({ label, hint, children, className = "" }) {
  return (
    <label className={`pa-field ${className}`.trim()}>
      {label ? <span className="pa-field__label">{label}</span> : null}
      {children}
      {hint ? <span className="pa-field__hint">{hint}</span> : null}
    </label>
  );
}

export function PartnerAdminSegmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="pa-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`pa-segmented__btn ${value === option.value ? "pa-segmented__btn--active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count != null ? <span className="pa-segmented__count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
