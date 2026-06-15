

"use client";

export default function SuccessModal({
  open,
  title = "تمت العملية بنجاح",
  message = "تم تنفيذ الطلب بنجاح",
  buttonText = "حسناً",
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[36px] bg-white shadow-2xl">
        <div className="flex justify-center pt-10">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border-[8px] border-emerald-400 shadow-[0_0_35px_rgba(52,211,153,0.35)]">
            <span className="text-6xl font-bold text-emerald-400">✓</span>
          </div>
        </div>

        <div className="px-8 pb-8 pt-6 text-center">
          <h2 className="mb-5 text-4xl font-extrabold text-slate-900">
            {title}
          </h2>

          <p className="mb-10 text-xl leading-9 text-slate-600">
            {message}
          </p>

          <button
            onClick={onClose}
            className="text-2xl font-bold text-blue-500 transition hover:text-blue-700"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}