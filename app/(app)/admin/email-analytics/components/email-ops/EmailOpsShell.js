export function EmailOpsShell({ children }) {
  return (
    <div className="relative z-0 overflow-hidden rounded-[34px] border border-slate-200 bg-slate-50 text-slate-900 shadow-lg dark:border-cyan-300/10 dark:bg-[#020617] dark:text-white dark:shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.08),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.06),transparent_30%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />
      <div className="relative z-10 space-y-6 p-4 md:p-6">{children}</div>
    </div>
  );
}
