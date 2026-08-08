"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function useMenuPosition(open, triggerRef) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setStyle(null);
      return undefined;
    }

    const update = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      setStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        minWidth: rect.width,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef]);

  return style;
}

export default function ContentPostSelect({
  label,
  value,
  onChange,
  options = [],
  ariaLabel,
  disabled = false,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuStyle = useMenuPosition(open, triggerRef);

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value]
  );
  const selected = options[selectedIndex] || options[0];

  useEffect(() => {
    if (!open) return undefined;
    setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

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

  function selectOption(option) {
    if (!option || disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event) {
    if (disabled) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(options[activeIndex]);
    }
  }

  const menu =
    open && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel || label}
            style={menuStyle}
            className="content-post-admin__select-menu"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li key={option.value || "empty"} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected ? "true" : "false"}
                    data-active={isActive ? "true" : "false"}
                    className="content-post-admin__select-option"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <span aria-hidden="true">✓</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="grid gap-2">
      {label ? <span className="content-post-admin__label text-sm font-bold">{label}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        className="content-post-admin__select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span>{selected?.label || "—"}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {menu}
    </div>
  );
}
