"use client";

import { ui } from "./ui-theme";

const VARIANTS = {
  info: ui.alertInfo,
  success: ui.alertSuccess,
  warning: ui.alertWarning,
  error: ui.alertError,
};

export function UiAlert({ variant = "info", className = "", children, ...props }) {
  const variantClass = VARIANTS[variant] || VARIANTS.info;
  return (
    <div className={`${variantClass} ${className}`.trim()} role="status" {...props}>
      {children}
    </div>
  );
}

export default UiAlert;
