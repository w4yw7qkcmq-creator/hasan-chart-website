"use client";

import { ui } from "./ui-theme";

const VARIANTS = {
  neutral: ui.badgeNeutral,
  positive: ui.badgePositive,
  negative: ui.badgeNegative,
  warning: ui.badgeWarning,
};

export function UiBadge({ variant = "neutral", className = "", children, ...props }) {
  const variantClass = VARIANTS[variant] || VARIANTS.neutral;
  return (
    <span className={`${variantClass} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export default UiBadge;
