"use client";

import { ui } from "./ui-theme";

const VARIANTS = {
  primary: ui.btnPrimary,
  secondary: ui.btnSecondary,
  ghost: ui.btnGhost,
  danger: ui.btnDanger,
};

export function UiButton({
  variant = "primary",
  className = "",
  type = "button",
  disabled = false,
  children,
  ...props
}) {
  const variantClass = VARIANTS[variant] || VARIANTS.primary;
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${variantClass} ${ui.focusRing} disabled:cursor-not-allowed disabled:opacity-60 ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export default UiButton;
