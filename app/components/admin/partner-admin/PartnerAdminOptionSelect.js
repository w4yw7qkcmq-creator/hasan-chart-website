"use client";

export default function PartnerAdminOptionSelect({ label, options, value, onChange, name }) {
  return (
    <fieldset className="pa-option-fieldset">
      {label ? <legend className="pa-field__label">{label}</legend> : null}
      <div className="pa-option-grid" role="radiogroup" aria-label={label || name}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`pa-option-card ${active ? "pa-option-card--active" : ""}`}
              onClick={() => onChange(option.value)}
            >
              <span className="pa-option-card__title">{option.label}</span>
              {option.description ? (
                <span className="pa-option-card__desc">{option.description}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
