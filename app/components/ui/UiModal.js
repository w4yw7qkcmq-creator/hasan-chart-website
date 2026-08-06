"use client";
import { useEffect } from "react";
import { UiButton } from "./UiButton";
import { ui } from "./ui-theme";
import { UiPortal } from "./UiPortal";
const TYPE_RING = {
  success: "border-[var(--ui-positive-border)] text-[var(--ui-positive)]",
  error: "border-[var(--ui-negative-border)] text-[var(--ui-negative)]",
  warning: "border-[var(--ui-warning-border)] text-[var(--ui-warning)]",
  info: "border-[var(--ui-border-strong)] text-[var(--ui-accent)]",
};
const TYPE_ICON = { success: "✓", error: "✕", warning: "!", info: "i" };
export function UiModal({
  open,
  type = "info",
  title = "",
  message = "",
  buttonText = "حسناً",
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  autoCloseMs = null,
  mode = "alert",
  onClose,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open || !autoCloseMs || mode === "confirm") return undefined;
    const timerId = window.setTimeout(() => onClose?.(), autoCloseMs);
    return () => window.clearTimeout(timerId);
  }, [open, autoCloseMs, mode, onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (mode === "confirm") {
        onCancel?.();
        return;
      }
      onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, mode, onClose, onCancel]);
  if (!open) return null;
  const ring = TYPE_RING[type] || TYPE_RING.info;
  const icon = TYPE_ICON[type] || TYPE_ICON.info;
  const handleBackdropClick = () => {
    if (mode === "confirm") {
      onCancel?.();
      return;
    }
    onClose?.();
  };
  return (
    <UiPortal>
      {" "}
      <div
        className={ui.modalScrim}
        onClick={handleBackdropClick}
        role="presentation"
      >
        {" "}
        <div
          className={`${ui.modalPanel} ${ui.focusRing}`}
          dir="rtl"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "ui-modal-title" : undefined}
          aria-describedby={message ? "ui-modal-message" : undefined}
        >
          {" "}
          <div
            className={`mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full border-[6px] text-5xl font-black ${ring}`}
          >
            {" "}
            {icon}{" "}
          </div>{" "}
          {title ? (
            <h3
              id="ui-modal-title"
              className="text-3xl font-black leading-relaxed ui-text-strong"
            >
              {" "}
              {title}{" "}
            </h3>
          ) : null}{" "}
          {message ? (
            <p
              id="ui-modal-message"
              className="mx-auto mt-4 max-w-sm whitespace-pre-line text-lg font-bold leading-9 ui-text-muted"
            >
              {" "}
              {message}{" "}
            </p>
          ) : null}{" "}
          {mode === "confirm" ? (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {" "}
              <UiButton variant="secondary" onClick={onCancel}>
                {" "}
                {cancelText}{" "}
              </UiButton>{" "}
              <UiButton variant="primary" onClick={onConfirm}>
                {" "}
                {confirmText}{" "}
              </UiButton>{" "}
            </div>
          ) : (
            <div className="mt-8">
              {" "}
              <UiButton variant="primary" onClick={onClose}>
                {" "}
                {buttonText}{" "}
              </UiButton>{" "}
            </div>
          )}{" "}
        </div>{" "}
      </div>{" "}
    </UiPortal>
  );
}
export default UiModal;
