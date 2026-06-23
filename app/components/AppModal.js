"use client";

import { createPortal } from "react-dom";

const TYPE_STYLES = {
  success: {
    ring: "border-emerald-400 text-emerald-500",
    shadow: "shadow-[0_0_50px_rgba(16,185,129,0.22)]",
    icon: "✓",
  },
  error: {
    ring: "border-red-400 text-red-500",
    shadow: "shadow-[0_0_50px_rgba(239,68,68,0.22)]",
    icon: "✕",
  },
  warning: {
    ring: "border-amber-400 text-amber-500",
    shadow: "shadow-[0_0_50px_rgba(245,158,11,0.22)]",
    icon: "!",
  },
  info: {
    ring: "border-blue-400 text-blue-500",
    shadow: "shadow-[0_0_50px_rgba(59,130,246,0.22)]",
    icon: "i",
  },
};

export default function AppModal({
  open,
  type = "info",
  title = "",
  message = "",
  buttonText = "حسناً",
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  mode = "alert",
  onClose,
  onConfirm,
  onCancel,
}) {
  if (!open || typeof document === "undefined") return null;

  const styles = TYPE_STYLES[type] || TYPE_STYLES.info;

  const handleBackdropClick = () => {
    if (mode === "confirm") {
      onCancel?.();
      return;
    }

    onClose?.();
  };

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 px-5 backdrop-blur-md"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-[34px] border border-white/70 bg-white p-8 text-center text-slate-950 shadow-[0_30px_100px_rgba(15,23,42,0.35)]"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        aria-describedby="app-modal-message"
      >
        <div
          className={`mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full border-[6px] text-5xl font-black ${styles.ring} ${styles.shadow}`}
        >
          {styles.icon}
        </div>

        {title ? (
          <h3 id="app-modal-title" className="text-3xl font-black leading-relaxed text-slate-950">
            {title}
          </h3>
        ) : null}

        {message ? (
          <p
            id="app-modal-message"
            className="mx-auto mt-4 max-w-sm whitespace-pre-line text-lg font-bold leading-9 text-slate-600"
          >
            {message}
          </p>
        ) : null}

        {mode === "confirm" ? (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl border border-slate-200 bg-slate-100 px-8 py-3 font-black text-slate-700 transition hover:bg-slate-200"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-3 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.28)] transition hover:scale-[1.02]"
            >
              {confirmText}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-8 rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-3 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.28)] transition hover:scale-[1.02]"
          >
            {buttonText}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
