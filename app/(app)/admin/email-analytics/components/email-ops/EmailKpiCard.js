const TONE_STYLES = {
  neutral: {
    card: "border-slate-200/80 dark:border-slate-400/15",
    glow: "from-slate-400/10 via-transparent to-transparent",
    icon: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
    accent: "text-slate-500 dark:text-slate-400",
  },
  amber: {
    card: "border-amber-200/80 dark:border-amber-400/20",
    glow: "from-amber-500/12 via-orange-400/8 to-transparent dark:from-amber-500/20",
    icon: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/25 dark:bg-amber-500/10 dark:text-amber-200",
    accent: "text-amber-700 dark:text-amber-300",
  },
  blue: {
    card: "border-blue-200/80 dark:border-blue-400/20",
    glow: "from-blue-500/12 via-cyan-400/8 to-transparent dark:from-blue-500/20",
    icon: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/25 dark:bg-blue-500/10 dark:text-blue-200",
    accent: "text-blue-700 dark:text-blue-300",
  },
  cyan: {
    card: "border-cyan-200/80 dark:border-cyan-400/20",
    glow: "from-cyan-500/12 via-blue-400/8 to-transparent dark:from-cyan-500/20",
    icon: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-300/25 dark:bg-cyan-500/10 dark:text-cyan-200",
    accent: "text-cyan-800 dark:text-cyan-300",
  },
  green: {
    card: "border-emerald-200/80 dark:border-emerald-400/20",
    glow: "from-emerald-500/12 via-teal-400/8 to-transparent dark:from-emerald-500/20",
    icon: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  red: {
    card: "border-red-200/80 dark:border-red-400/20",
    glow: "from-red-500/12 via-orange-400/8 to-transparent dark:from-red-500/20",
    icon: "border-red-200 bg-red-50 text-red-700 dark:border-red-300/25 dark:bg-red-500/10 dark:text-red-200",
    accent: "text-red-700 dark:text-red-300",
  },
  gray: {
    card: "border-slate-200/80 dark:border-slate-400/15",
    glow: "from-slate-400/10 via-transparent to-transparent",
    icon: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
    accent: "text-slate-500 dark:text-slate-400",
  },
  orange: {
    card: "border-orange-200/80 dark:border-orange-400/20",
    glow: "from-orange-500/12 via-amber-400/8 to-transparent dark:from-orange-500/20",
    icon: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-300/25 dark:bg-orange-500/10 dark:text-orange-200",
    accent: "text-orange-700 dark:text-orange-300",
  },
};

export function EmailKpiCard({ label, value, hint, tone = "blue", icon: Icon, compact = false }) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.blue;

  return (
    <div
      className={`group relative overflow-hidden rounded-[24px] border bg-white/95 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 dark:bg-white/[0.04] dark:shadow-[0_14px_40px_rgba(0,0,0,0.22)] ${styles.card} ${compact ? "p-4" : "p-5 md:p-6"}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br opacity-80 ${styles.glow}`} />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-black ${styles.accent}`}>{label}</p>
          <p className={`mt-2 font-black tracking-tight text-slate-950 dark:text-white ${compact ? "text-2xl" : "text-3xl"}`}>
            {value}
          </p>
          {hint ? <p className="mt-1.5 text-xs leading-6 text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${styles.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AudienceMetricGrid({ counts, loading = false }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[20px] bg-slate-200/70 dark:bg-white/10" />
        ))}
      </div>
    );
  }

  if (!counts) return null;

  const items = [
    { label: "إجمالي الحسابات", value: counts.totalAccounts, tone: "blue" },
    { label: "موافقون", value: counts.marketingOptedIn, tone: "green" },
    { label: "غير موافقين", value: counts.neverOptedIn, tone: "neutral" },
    { label: "ألغوا الاشتراك", value: counts.marketingOptedOut, tone: "gray" },
    { label: "مُستبعدون", value: counts.hardSuppressed, tone: "red" },
    { label: "المؤهلون", value: counts.campaignEligible, tone: "cyan" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <EmailKpiCard key={item.label} compact label={item.label} value={item.value ?? 0} tone={item.tone} />
      ))}
    </div>
  );
}
