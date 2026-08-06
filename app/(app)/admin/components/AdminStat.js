const GLOW_CLASS = {
  green: "admin-stat-glow admin-stat-glow--green",
  orange: "admin-stat-glow admin-stat-glow--orange",
  red: "admin-stat-glow admin-stat-glow--red",
  blue: "admin-stat-glow admin-stat-glow--blue",
};

export default function AdminStat({
  title,
  value,
  icon,
  subtitle,
  tone = "blue",
}) {
  const glowClass = GLOW_CLASS[tone] || GLOW_CLASS.blue;

  return (
    <div className="relative overflow-hidden rounded-[28px] border admin-panel-border ui-glass-045 p-6 shadow-2xl backdrop-blur-2xl">
      <div className={`pointer-events-none absolute inset-0 ${glowClass}`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold admin-text-muted">{title}</p>
          <h3 className="mt-3 text-4xl font-black admin-text drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]">
            {value}
          </h3>
          <p className="mt-2 text-sm admin-text-muted">{subtitle}</p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl border admin-panel-border admin-panel text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)]">
          {icon}
        </div>
      </div>
    </div>
  );
}
