import { IconCheck } from "../icons-ops";

const STATUS_RING = {
  complete: "bg-emerald-500 text-white",
  needs_review: "bg-amber-500 text-white",
  current: "bg-gradient-to-l from-blue-600 to-cyan-400 text-white",
  incomplete: "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-200",
};

const STATUS_CARD = {
  complete:
    "border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-500/10",
  needs_review:
    "border-amber-200 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-500/10",
  current:
    "border-cyan-300 bg-gradient-to-l from-blue-600/10 via-cyan-400/10 to-transparent shadow-md dark:border-cyan-400/30 dark:from-blue-500/15",
  incomplete: "border-slate-200 bg-white/80 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
};

export function EmailStepper({ steps, currentStep, stepStates, onStepClick }) {
  return (
    <ol className="grid gap-3 md:grid-cols-4">
      {steps.map((step, index) => {
        const state = stepStates?.[index] || (index < currentStep ? "complete" : index === currentStep ? "current" : "incomplete");
        const active = state === "current";

        return (
          <li key={step.title}>
            <button
              type="button"
              onClick={() => onStepClick?.(index)}
              className={`w-full rounded-[22px] border p-4 text-right transition ${STATUS_CARD[state] || STATUS_CARD.incomplete}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${STATUS_RING[state] || STATUS_RING.incomplete}`}
                >
                  {state === "complete" ? (
                    <IconCheck className="h-4 w-4" />
                  ) : state === "needs_review" ? (
                    "!"
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={`text-xs font-black ${active ? "text-cyan-700 dark:text-cyan-300" : "text-slate-500"}`}>
                  {index + 1}
                </span>
              </div>
              <h3 className="mt-3 font-black text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{step.description}</p>
              {state === "needs_review" ? (
                <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">تحتاج مراجعة</p>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function deriveComposeWizardStepStates({ step, readiness, form, campaign }) {
  const messageComplete = Boolean(String(form?.subject || "").trim() && String(form?.htmlContent || "").trim());
  const snapshotStale = campaign?.metadata?.audienceSnapshotStale === true;
  const audiencePrepared = readiness?.audiencePrepared === true && !snapshotStale;
  const audienceNeedsReview =
    snapshotStale || readiness?.blockers?.some((b) => b.code === "snapshot_stale") === true;

  return WIZARD_STEP_INDICES.map((index) => {
    if (index === step) return "current";
    if (index === 0) {
      if (audienceNeedsReview) return "needs_review";
      if (audiencePrepared) return "complete";
      return "incomplete";
    }
    if (index === 1) return messageComplete ? "complete" : "incomplete";
    if (index === 2) return step > 2 ? "complete" : "incomplete";
    return "incomplete";
  });
}

const WIZARD_STEP_INDICES = [0, 1, 2, 3];
