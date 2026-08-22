import { IconAlert } from "../icons-ops";

export function EmailEmptyState({ icon: Icon = IconAlert, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center dark:border-cyan-300/15 dark:bg-white/[0.03]">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-[22px] border border-cyan-200/50 bg-gradient-to-br from-cyan-50 to-blue-50 text-cyan-700 dark:border-cyan-300/20 dark:from-cyan-500/10 dark:to-blue-500/10 dark:text-cyan-200">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-black text-slate-900 dark:text-white">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-7 text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
