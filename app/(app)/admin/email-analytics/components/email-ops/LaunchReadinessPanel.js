import { EmailPrimaryButton } from "./EmailFormField";

const TONE_STYLES = {
  ready: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/25 dark:bg-emerald-500/10",
  blocked: "border-red-200 bg-red-50/80 dark:border-red-400/25 dark:bg-red-500/10",
  warning: "border-amber-200 bg-amber-50/80 dark:border-amber-400/25 dark:bg-amber-500/10",
  loading: "border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.03]",
};

export function LaunchReadinessPanel({
  readiness,
  loading = false,
  onGoToAudience,
  onReprepareAudience,
}) {
  if (loading) {
    return (
      <div className={`rounded-[24px] border p-5 ${TONE_STYLES.loading}`}>
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">جاري التحقق من جاهزية الإطلاق...</p>
      </div>
    );
  }

  if (!readiness) return null;

  const primaryBlocker = readiness.blockers?.[0];
  const tone = readiness.ready ? "ready" : primaryBlocker?.code === "zero_eligible" || primaryBlocker?.code === "snapshot_stale" ? "warning" : "blocked";

  if (readiness.ready) {
    return (
      <div className={`rounded-[24px] border p-5 ${TONE_STYLES.ready}`}>
        <p className="text-base font-black text-emerald-900 dark:text-emerald-100">🟢 الحملة جاهزة للإرسال</p>
        <p className="mt-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">
          تم تجهيز الجمهور ومراجعة بيانات الحملة.
        </p>
        {readiness.warnings?.length ? (
          <ul className="mt-3 space-y-1 text-xs font-bold text-amber-800 dark:text-amber-200">
            {readiness.warnings.map((w) => (
              <li key={w.code}>🟠 {w.message}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const title = primaryBlocker?.title || "لا يمكن بدء الحملة";
  const message = primaryBlocker?.message || "راجع الخطوات السابقة قبل الإطلاق.";
  const icon = tone === "warning" ? "🟠" : "🔴";

  return (
    <div className={`rounded-[24px] border p-5 ${TONE_STYLES[tone]}`}>
      <p className="text-base font-black text-slate-900 dark:text-white">
        {icon} {title}
      </p>
      <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{message}</p>
      {readiness.blockers?.length > 1 ? (
        <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {readiness.blockers.slice(1).map((b) => (
            <li key={b.code}>• {b.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {primaryBlocker?.action === "go_to_audience" && onGoToAudience ? (
          <EmailPrimaryButton variant="secondary" onClick={onGoToAudience}>
            العودة إلى الجمهور
          </EmailPrimaryButton>
        ) : null}
        {primaryBlocker?.action === "reprepare_audience" && onReprepareAudience ? (
          <EmailPrimaryButton variant="secondary" onClick={onReprepareAudience}>
            إعادة تجهيز الجمهور
          </EmailPrimaryButton>
        ) : null}
      </div>
    </div>
  );
}
