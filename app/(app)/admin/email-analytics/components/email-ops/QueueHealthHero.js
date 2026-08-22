import { EmailKpiCard } from "./EmailKpiCard";
import { deriveQueueHealth, formatDurationMs } from "./utils";
import { IconInbox } from "../icons-ops";

export function QueueHealthHero({ metrics }) {
  const health = deriveQueueHealth(metrics);
  const counts = metrics?.counts || {};

  const healthStyles = {
    healthy: "border-emerald-200 bg-gradient-to-l from-emerald-50 to-cyan-50 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:to-cyan-500/5",
    warning: "border-amber-200 bg-gradient-to-l from-amber-50 to-orange-50 dark:border-amber-400/20 dark:from-amber-500/10 dark:to-orange-500/5",
    unknown: "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]",
  };

  return (
    <section className={`rounded-[28px] border p-5 md:p-6 ${healthStyles[health.level] || healthStyles.unknown}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-200 bg-white text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-500/10 dark:text-cyan-200">
            <IconInbox className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black">صحة نظام الإرسال</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{health.description}</p>
            <p className="mt-2 inline-flex rounded-full border border-current/20 px-3 py-1 text-xs font-black">
              {health.label}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          عينة: {metrics?.sampleSize ?? 0} رسالة
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <EmailKpiCard compact label="بانتظار الإرسال" value={counts.pending ?? 0} tone="amber" />
        <EmailKpiCard compact label="أقدم عنصر منتظر" value={formatDurationMs(metrics?.oldestPendingAgeMs)} tone="blue" />
        <EmailKpiCard compact label="إنتاجية آخر ساعة" value={metrics?.throughputLastHour ?? 0} tone="cyan" hint="رسائل مُرسلة" />
        <EmailKpiCard compact label="أخطاء في العينة" value={counts.failed ?? 0} tone="red" hint={`متأخرة: ${counts.staleProcessing ?? 0}`} />
      </div>
    </section>
  );
}
