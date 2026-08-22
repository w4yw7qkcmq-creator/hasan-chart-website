"use client";

export function ConfirmModal({ open, title, description, confirmLabel = "تأكيد", cancelLabel = "إلغاء", onConfirm, onCancel, danger = false, busy = false }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-cyan-300/15 dark:bg-[#07142f]"
      >
        <h3 className="text-xl font-black">{title}</h3>
        {description ? <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-[16px] border border-slate-200 px-4 py-2.5 font-bold dark:border-white/10" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`rounded-[16px] px-4 py-2.5 font-black text-white disabled:opacity-60 ${danger ? "bg-red-600" : "bg-gradient-to-l from-blue-600 to-cyan-400"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
