import {
  CAMPAIGN_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  QUEUE_STATUS_LABELS,
  getCampaignStatusLabel,
  getDeliveryStatusLabel,
  getQueueStatusLabel,
} from "./labels";

const VARIANTS = {
  pending: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-400/20",
  processing: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-400/20",
  accepted: "bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:border-cyan-400/20",
  sent: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-400/20",
  delivered: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-400/20",
  failed: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-400/20",
  skipped: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-200 dark:border-white/10",
  uncertain: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:border-orange-400/20",
  draft: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-200 dark:border-white/10",
  preparing: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:border-violet-400/20",
  ready: "bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-200 dark:border-cyan-400/20",
  sending: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-400/20",
  paused: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-400/20",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-400/20",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10",
  bounced: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-400/20",
  complained: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:border-orange-400/20",
  suppressed: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10",
  excluded: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10",
};

function resolveLabel(kind, status) {
  const key = String(status || "").trim().toLowerCase();
  if (kind === "campaign") return getCampaignStatusLabel(key);
  if (kind === "delivery") return getDeliveryStatusLabel(key);
  return getQueueStatusLabel(key);
}

export function EmailStatusBadge({ status, kind = "queue", className = "" }) {
  const key = String(status || "").trim().toLowerCase();
  const label = resolveLabel(kind, key);
  const style = VARIANTS[key] || VARIANTS.pending;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${style} ${className}`}>
      {label}
    </span>
  );
}

export { CAMPAIGN_STATUS_LABELS, DELIVERY_STATUS_LABELS, QUEUE_STATUS_LABELS };
