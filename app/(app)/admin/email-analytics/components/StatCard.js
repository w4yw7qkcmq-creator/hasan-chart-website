import { STAT_ICON_MAP } from "./icons";

const TONE_STYLES = {
  blue: {
    card: "border-blue-200/80 dark:border-blue-400/20",
    glow: "from-blue-500/15 via-cyan-400/10 to-transparent dark:from-blue-500/25 dark:via-cyan-400/15",
    icon: "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-300/25 dark:bg-blue-500/10 dark:text-blue-200",
    accent: "text-blue-600 dark:text-blue-300",
  },
  green: {
    card: "border-emerald-200/80 dark:border-emerald-400/20",
    glow: "from-emerald-500/15 via-teal-400/10 to-transparent dark:from-emerald-500/25 dark:via-teal-400/15",
    icon: "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-300/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    accent: "text-emerald-600 dark:text-emerald-300",
  },
  purple: {
    card: "border-violet-200/80 dark:border-violet-400/20",
    glow: "from-violet-500/15 via-fuchsia-400/10 to-transparent dark:from-violet-500/25 dark:via-fuchsia-400/15",
    icon: "border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-300/25 dark:bg-violet-500/10 dark:text-violet-200",
    accent: "text-violet-600 dark:text-violet-300",
  },
  red: {
    card: "border-red-200/80 dark:border-red-400/20",
    glow: "from-red-500/15 via-orange-400/10 to-transparent dark:from-red-500/25 dark:via-orange-400/15",
    icon: "border-red-200 bg-red-50 text-red-600 dark:border-red-300/25 dark:bg-red-500/10 dark:text-red-200",
    accent: "text-red-600 dark:text-red-300",
  },
  orange: {
    card: "border-amber-200/80 dark:border-amber-400/20",
    glow: "from-amber-500/15 via-orange-400/10 to-transparent dark:from-amber-500/25 dark:via-orange-400/15",
    icon: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/25 dark:bg-amber-500/10 dark:text-amber-200",
    accent: "text-amber-700 dark:text-amber-300",
  },
};

export function StatCard({ title, value, subtitle, tone = "blue", iconKey, delay = 0 }) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.blue;
  const Icon = STAT_ICON_MAP[iconKey] || STAT_ICON_MAP.total;

  return (
    <div
      className={`group relative overflow-hidden rounded-[28px] border bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:bg-white/[0.045] dark:shadow-[0_18px_50px_rgba(0,0,0,0.25)] dark:hover:shadow-[0_24px_70px_rgba(0,102,255,0.18)] md:p-6 ${styles.card}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br opacity-80 transition group-hover:opacity-100 ${styles.glow}`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-xs font-black uppercase tracking-[0.18em] ${styles.accent}`}>{title}</p>
          <h3 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white md:text-4xl">
            {value}
          </h3>
          {subtitle ? (
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-300">{subtitle}</p>
          ) : null}
        </div>
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-sm transition duration-300 group-hover:scale-105 md:h-14 md:w-14 ${styles.icon}`}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

export function buildStatCards(summary) {
  return [
    {
      iconKey: "total",
      title: "إجمالي المرسل",
      value: summary.totalSent.toLocaleString("ar"),
      subtitle: "جميع الرسائل المسجلة",
      tone: "blue",
    },
    {
      iconKey: "delivered",
      title: "تم التسليم",
      value: summary.delivered.toLocaleString("ar"),
      subtitle: "تم التسليم بنجاح",
      tone: "green",
    },
    {
      iconKey: "openRate",
      title: "معدل الفتح",
      value: `${summary.openRate}%`,
      subtitle: `${summary.opened || 0} رسالة مفتوحة`,
      tone: "purple",
    },
    {
      iconKey: "clickRate",
      title: "معدل النقر",
      value: `${summary.clickRate}%`,
      subtitle: `${summary.clicked || 0} نقرة`,
      tone: "blue",
    },
    {
      iconKey: "failed",
      title: "فشل",
      value: summary.failed.toLocaleString("ar"),
      subtitle: "فشل الإرسال",
      tone: "red",
    },
    {
      iconKey: "bounced",
      title: "ارتداد",
      value: summary.bounced.toLocaleString("ar"),
      subtitle: "رسائل مرتدة",
      tone: "red",
    },
    {
      iconKey: "complaints",
      title: "شكاوى",
      value: summary.complaints.toLocaleString("ar"),
      subtitle: "بلاغات spam",
      tone: "orange",
    },
    {
      iconKey: "deliverability",
      title: "نسبة التسليم",
      value: `${summary.deliverability}%`,
      subtitle: "نسبة التسليم الفعلية",
      tone: "green",
    },
  ];
}
