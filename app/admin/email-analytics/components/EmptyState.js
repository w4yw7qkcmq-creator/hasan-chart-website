export function EmptyState({ title = "لا توجد بيانات بعد", description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="relative mb-6 grid h-24 w-24 place-items-center rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-cyan-300/20 dark:from-cyan-400/10 dark:to-blue-500/5 dark:shadow-[0_20px_60px_rgba(0,102,255,0.12)]">
        <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.25),transparent_55%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.35),transparent_55%)]" />
        <span className="relative text-5xl">📭</span>
      </div>
      <h3 className="text-2xl font-black text-slate-950 dark:text-white">{title}</h3>
      {description ? (
        <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-300">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
