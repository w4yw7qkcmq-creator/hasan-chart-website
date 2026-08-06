export default function AdminStat({ title, value, icon, subtitle, tone = "blue" }) {
  const glow =
    tone === "green"
      ? "from-emerald-400/20 to-cyan-400/10"
      : tone === "orange"
      ? "from-amber-400/20 to-orange-400/10"
      : tone === "red"
      ? "from-red-400/20 to-orange-400/10"
      : "from-blue-500/20 to-cyan-400/10";

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glow}`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-300">{title}</p>
          <h3 className="mt-3 text-4xl font-black text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]">{value}</h3>
          <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-black/25 text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)]">
          {icon}
        </div>
      </div>
    </div>
  );
}
