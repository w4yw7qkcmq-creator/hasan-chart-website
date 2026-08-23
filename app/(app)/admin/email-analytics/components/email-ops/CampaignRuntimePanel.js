import Link from "next/link";
import { EmailPrimaryButton } from "./EmailFormField";

const RUNTIME_TONES = {
  sending: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/25 dark:bg-emerald-500/10",
  paused: "border-amber-200 bg-amber-50/80 dark:border-amber-400/25 dark:bg-amber-500/10",
  completed: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/25 dark:bg-emerald-500/10",
  failed: "border-red-200 bg-red-50/80 dark:border-red-400/25 dark:bg-red-500/10",
  cancelled: "border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.03]",
};

const RUNTIME_COPY = {
  sending: {
    icon: "🟢",
    title: "تم بدء الحملة بنجاح",
    message: "الحملة الآن قيد الإرسال.",
  },
  paused: {
    icon: "🟠",
    title: "الحملة متوقفة مؤقتًا",
    message: "يمكنك استئناف الإرسال من صفحة تفاصيل الحملة.",
  },
  completed: {
    icon: "🟢",
    title: "اكتملت الحملة",
    message: "تم إنهاء إرسال هذه الحملة.",
  },
  failed: {
    icon: "🔴",
    title: "فشلت الحملة",
    message: "راجع تفاصيل الحملة لمعرفة سبب الفشل.",
  },
  cancelled: {
    icon: "⚪",
    title: "تم إلغاء الحملة",
    message: "لم تعد هذه الحملة قيد الإرسال.",
  },
};

export function CampaignRuntimePanel({ readiness, campaignId, launching = false }) {
  if (launching) {
    return (
      <div className={`rounded-[24px] border p-5 ${RUNTIME_TONES.sending}`}>
        <p className="text-base font-black text-emerald-900 dark:text-emerald-100">جارٍ بدء الحملة…</p>
        <p className="mt-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">
          يرجى الانتظار حتى اكتمال بدء الإرسال.
        </p>
      </div>
    );
  }

  const phase = readiness?.runtimePhase || readiness?.status || "sending";
  const copy = RUNTIME_COPY[phase] || RUNTIME_COPY.sending;
  const metrics = readiness?.metrics || {};
  const tone = RUNTIME_TONES[phase] || RUNTIME_TONES.sending;

  return (
    <div className={`rounded-[24px] border p-5 ${tone}`}>
      <p className="text-base font-black text-slate-900 dark:text-white">
        {copy.icon} {copy.title}
      </p>
      <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{copy.message}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">في الطابور</p>
          <p className="text-lg font-black">{Number(metrics.queued || 0).toLocaleString("ar")}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">تم التسليم</p>
          <p className="text-lg font-black">{Number(metrics.delivered || 0).toLocaleString("ar")}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">فشل</p>
          <p className="text-lg font-black">{Number(metrics.failed || 0).toLocaleString("ar")}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">المؤهلون</p>
          <p className="text-lg font-black">{Number(metrics.eligible || readiness?.eligibleCount || 0).toLocaleString("ar")}</p>
        </div>
      </div>

      {campaignId ? (
        <div className="mt-4">
          <Link
            href={`/admin/email-analytics/campaigns/${campaignId}`}
            className="inline-flex items-center text-sm font-bold text-cyan-600 hover:text-cyan-700 dark:text-cyan-300"
          >
            عرض تفاصيل الحملة
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function LaunchingActionBar({ launching, launchEnabled, onLaunch, onBack, campaignId }) {
  return (
    <div className="flex flex-wrap gap-3">
      <EmailPrimaryButton variant="secondary" onClick={onBack} disabled={launching}>
        العودة للتعديل
      </EmailPrimaryButton>
      <EmailPrimaryButton disabled={!launchEnabled || launching} onClick={onLaunch}>
        {launching ? "جارٍ بدء الحملة…" : "بدء الحملة"}
      </EmailPrimaryButton>
      {campaignId ? (
        <Link href={`/admin/email-analytics/campaigns/${campaignId}`} className="inline-flex items-center text-sm font-bold text-cyan-600">
          عرض تفاصيل الحملة
        </Link>
      ) : null}
    </div>
  );
}
