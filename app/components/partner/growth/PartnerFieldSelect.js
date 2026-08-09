"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 280;
const MENU_MIN_HEIGHT = 120;

function usePortalMenuPosition(open, triggerRef, menuRef, optionCount) {
  const [style, setStyle] = useState(null);
  const [openUpward, setOpenUpward] = useState(false);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setStyle(null);
      return undefined;
    }

    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const measuredHeight = menuRef.current?.scrollHeight || MENU_MAX_HEIGHT;
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
      const spaceAbove = rect.top - MENU_GAP;
      const shouldOpenUp = spaceBelow < MENU_MIN_HEIGHT && spaceAbove > spaceBelow;
      const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, availableSpace - 4));

      setOpenUpward(shouldOpenUp);
      setStyle({
        position: "fixed",
        top: shouldOpenUp ? undefined : rect.bottom + MENU_GAP,
        bottom: shouldOpenUp ? window.innerHeight - rect.top + MENU_GAP : undefined,
        left: rect.left,
        width: rect.width,
        minWidth: rect.width,
        maxHeight,
        zIndex: 10000,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, optionCount, triggerRef, menuRef]);

  return { style, openUpward };
}

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
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();
  const labelId = useId();
  const errorId = useId();

  const selected = options.find((opt) => opt.value === value) || null;
  const hasValue = Boolean(selected);
  const { style: menuStyle, openUpward } = usePortalMenuPosition(
    open,
    triggerRef,
    menuRef,
    options.length
  );

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  const selectOption = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
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
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const menu =
    open && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <ul
            id={listId}
            ref={menuRef}
            role="listbox"
            className={`partner-custom-select__menu partner-custom-select__menu--portal ${openUpward ? "partner-custom-select__menu--up" : ""}`}
            style={menuStyle}
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
                    <span className="partner-custom-select__option-main">
                      {opt.icon ? (
                        <span className="partner-custom-select__icon" aria-hidden="true">
                          {opt.icon}
                        </span>
                      ) : null}
                      <span className="partner-custom-select__option-label">{opt.label}</span>
                    </span>
                    {isSelected ? (
                      <span className="partner-custom-select__check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )
      : null;

  return (
    <label className="partner-field" ref={rootRef}>
      <span className="partner-label" id={labelId}>
        {label}
      </span>
      <div className={`partner-custom-select ${open ? "is-open" : ""}`}>
        <button
          ref={triggerRef}
          type="button"
          className={`partner-custom-select__trigger partner-input ${hasValue ? "partner-custom-select__trigger--filled" : ""} ${error ? "partner-input--error" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelId}
          aria-controls={listId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
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
            <span className="partner-custom-select__label">{selected?.label || placeholder}</span>
          </span>
          <span className="partner-custom-select__chevron" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      {menu}
      {error ? (
        <p className="partner-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="partner-input-hint">{hint}</p>
      ) : null}
    </label>
  );
}

export default PartnerFieldSelect;
