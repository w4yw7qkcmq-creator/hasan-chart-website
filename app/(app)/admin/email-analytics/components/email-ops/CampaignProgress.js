import { EmailStatusBadge } from "./EmailStatusBadge";
import { computeCampaignProgress } from "./utils";

export function CampaignProgress({ campaign, showBadge = true }) {
  const { percent, detail } = computeCampaignProgress(campaign);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-l from-blue-600 via-cyan-500 to-cyan-300 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
        <span className="shrink-0 text-sm font-black text-cyan-700 dark:text-cyan-300">{percent}%</span>
      </div>
      {showBadge ? <EmailStatusBadge status={campaign?.status} kind="campaign" /> : null}
    </div>
  );
}
