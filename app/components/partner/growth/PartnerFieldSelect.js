"use client";

import { useEffect, useId, useRef, useState } from "react";

export function PartnerFieldSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "اختر...",
  disabled = false,
  error = "",
  hint = "",
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listId = useId();
  const labelId = useId();

  const selected = options.find((opt) => opt.value === value) || null;

  useEffect(() => {
    const onDocClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  const selectOption = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(options.length - 1);
        return;
      }
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
        return;
      }
      if (activeIndex >= 0 && options[activeIndex]) {
        selectOption(options[activeIndex].value);
      }
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <label className="partner-field" ref={rootRef}>
      <span className="partner-label" id={labelId}>
        {label}
      </span>
      <div className="partner-custom-select">
        <button
          type="button"
          className={`partner-custom-select__trigger partner-input ${error ? "partner-input--error" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelId}
          aria-controls={listId}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onKeyDown}
        >
          <span className="partner-custom-select__value">
            {selected?.icon ? (
              <span className="partner-custom-select__icon" aria-hidden="true">
                {selected.icon}
              </span>
            ) : null}
            <span>{selected?.label || placeholder}</span>
          </span>
          <span className="partner-custom-select__chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="partner-custom-select__menu"
            aria-labelledby={labelId}
          >
            {options.map((opt, index) => {
              const isSelected = opt.value === value;
              const isActive = index === activeIndex;
              return (
                <li key={opt.value || "__empty"} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`partner-custom-select__option ${isSelected ? "is-selected" : ""} ${isActive ? "is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(opt.value)}
                  >
                    {opt.icon ? (
                      <span className="partner-custom-select__icon" aria-hidden="true">
                        {opt.icon}
                      </span>
                    ) : null}
                    <span>{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p className="partner-field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="partner-input-hint">{hint}</p>
      ) : null}
    </label>
  );
}

export default PartnerFieldSelect;
