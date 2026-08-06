"use client";

import { ui } from "./ui-theme";

export function UiEmptyState({ title = "لا توجد بيانات", description = "", className = "" }) {
  return (
    <div className={`${ui.empty} ${className}`.trim()}>
      <p className="font-black ui-text-strong">{title}</p>
      {description ? <p className="mt-2 text-sm ui-text-muted">{description}</p> : null}
    </div>
  );
}

export function UiLoadingState({ label = "جاري التحميل...", className = "" }) {
  return (
    <div className={`${ui.loading} ${className}`.trim()} aria-live="polite" aria-busy="true">
      <p className="font-bold ui-text-muted">{label}</p>
    </div>
  );
}

export function UiErrorState({ title = "حدث خطأ", description = "", className = "" }) {
  return (
    <div className={`${ui.error} ${className}`.trim()} role="alert">
      <p className="font-black">{title}</p>
      {description ? <p className="mt-2 text-sm">{description}</p> : null}
    </div>
  );
}
