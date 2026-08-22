export function EmailFormField({
  label,
  helper,
  error,
  children,
  counter,
  maxLength,
  valueLength = 0,
}) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black text-slate-800 dark:text-slate-100">{label}</span>
        {counter && maxLength ? (
          <span className="text-xs font-bold text-slate-400">{valueLength}/{maxLength}</span>
        ) : null}
      </div>
      {children}
      {helper ? <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">{helper}</p> : null}
      {error ? <p className="text-xs font-bold text-red-600 dark:text-red-300">{error}</p> : null}
    </label>
  );
}

export function EmailTextInput(props) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 dark:border-white/10 dark:bg-black/20 dark:text-white ${className}`}
    />
  );
}

export function EmailTextArea(props) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 dark:border-white/10 dark:bg-black/20 dark:text-white ${className}`}
    />
  );
}

export function EmailPrimaryButton({ children, className = "", variant = "primary", ...rest }) {
  const styles =
    variant === "danger"
      ? "bg-gradient-to-l from-red-600 to-red-500 text-white shadow-lg shadow-red-500/20"
      : variant === "secondary"
        ? "border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white"
        : "bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-400 text-white shadow-lg shadow-cyan-500/20";

  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[18px] px-5 py-3 text-sm font-black transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function EmailAlertBanner({ tone = "info", children }) {
  const styles = {
    info: "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-400/20 dark:bg-cyan-500/10 dark:text-cyan-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200",
    warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100",
  };

  return (
    <div className={`rounded-[20px] border px-4 py-3 text-sm font-bold ${styles[tone] || styles.info}`}>
      {children}
    </div>
  );
}
