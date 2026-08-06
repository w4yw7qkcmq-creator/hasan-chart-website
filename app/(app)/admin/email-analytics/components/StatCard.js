import { STAT_ICON_MAP } from "./icons";
const TONE_CLASS = {
  blue: "admin-email-stat admin-email-stat--blue",
  green: "admin-email-stat admin-email-stat--green",
  purple: "admin-email-stat admin-email-stat--purple",
  red: "admin-email-stat admin-email-stat--red",
  orange: "admin-email-stat admin-email-stat--orange",
};
export function StatCard({
  title,
  value,
  subtitle,
  tone = "blue",
  iconKey,
  delay = 0,
}) {
  const cardClass = TONE_CLASS[tone] || TONE_CLASS.blue;
  const Icon = STAT_ICON_MAP[iconKey] || STAT_ICON_MAP.total;
  return (
    <div
      className={`${cardClass} group`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {" "}
      <div className="admin-email-stat__glow" aria-hidden="true" />{" "}
      <div className="relative z-10 flex items-start justify-between gap-4">
        {" "}
        <div className="min-w-0">
          {" "}
          <p className="admin-email-stat__label">{title}</p>{" "}
          <h3 className="admin-email-stat__value">{value}</h3>{" "}
          {subtitle ? (
            <p className="admin-email-stat__subtitle">{subtitle}</p>
          ) : null}{" "}
        </div>{" "}
        <div className="admin-email-stat__icon">
          {" "}
          <Icon className="h-6 w-6" />{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
export function buildStatCards(summary) {
  return [
    {
      iconKey: "total",
      title: "Total Sent",
      value: summary.totalSent.toLocaleString("ar"),
      subtitle: "جميع الرسائل المسجلة",
      tone: "blue",
    },
    {
      iconKey: "delivered",
      title: "Delivered",
      value: summary.delivered.toLocaleString("ar"),
      subtitle: "تم التسليم بنجاح",
      tone: "green",
    },
    {
      iconKey: "openRate",
      title: "Open Rate",
      value: `${summary.openRate}%`,
      subtitle: `${summary.opened || 0} رسالة مفتوحة`,
      tone: "purple",
    },
    {
      iconKey: "clickRate",
      title: "Click Rate",
      value: `${summary.clickRate}%`,
      subtitle: `${summary.clicked || 0} نقرة`,
      tone: "blue",
    },
    {
      iconKey: "failed",
      title: "Failed",
      value: summary.failed.toLocaleString("ar"),
      subtitle: "فشل الإرسال",
      tone: "red",
    },
    {
      iconKey: "bounced",
      title: "Bounced",
      value: summary.bounced.toLocaleString("ar"),
      subtitle: "رسائل مرتدة",
      tone: "red",
    },
    {
      iconKey: "complaints",
      title: "Complaints",
      value: summary.complaints.toLocaleString("ar"),
      subtitle: "بلاغات spam",
      tone: "orange",
    },
    {
      iconKey: "deliverability",
      title: "Deliverability %",
      value: `${summary.deliverability}%`,
      subtitle: "نسبة التسليم الفعلية",
      tone: "green",
    },
  ];
}
