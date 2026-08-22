import { IconCheck } from "../icons-ops";

export function EmailStepper({ steps, currentStep, onStepClick }) {
  return (
    <ol className="grid gap-3 md:grid-cols-4">
      {steps.map((step, index) => {
        const done = index < currentStep;
        const active = index === currentStep;

        return (
          <li key={step.title}>
            <button
              type="button"
              onClick={() => onStepClick?.(index)}
              className={`w-full rounded-[22px] border p-4 text-right transition ${
                active
                  ? "border-cyan-300 bg-gradient-to-l from-blue-600/10 via-cyan-400/10 to-transparent shadow-md dark:border-cyan-400/30 dark:from-blue-500/15"
                  : done
                    ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-500/10"
                    : "border-slate-200 bg-white/80 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-gradient-to-l from-blue-600 to-cyan-400 text-white"
                        : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-200"
                  }`}
                >
                  {done ? <IconCheck className="h-4 w-4" /> : index + 1}
                </span>
                <span className={`text-xs font-black ${active ? "text-cyan-700 dark:text-cyan-300" : "text-slate-500"}`}>
                  {index + 1}
                </span>
              </div>
              <h3 className="mt-3 font-black text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{step.description}</p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
