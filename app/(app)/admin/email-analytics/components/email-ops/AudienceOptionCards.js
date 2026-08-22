import { AUDIENCE_ICON_MAP } from "../icons-ops";
import { AUDIENCE_OPTIONS } from "./labels";

export function AudienceOptionCards({ value, onChange }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {AUDIENCE_OPTIONS.map((option) => {
        const active = value === option.value;
        const Icon = AUDIENCE_ICON_MAP[option.iconKey];

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-[22px] border p-4 text-right transition ${
              active
                ? "border-cyan-300 bg-gradient-to-l from-blue-600/8 via-cyan-400/10 to-transparent shadow-md dark:border-cyan-400/30"
                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-2xl border ${active ? "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"}`}>
                {Icon ? <Icon className="h-5 w-5" /> : null}
              </div>
              <div>
                <h4 className="font-black text-slate-900 dark:text-white">{option.title}</h4>
                <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{option.description}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
