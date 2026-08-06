import Link from "next/link";

/**
 * @param {{
 *   assets?: Array<{ id: string, symbol: string, name: string, path: string, kind?: "asset" | "market" }>,
 *   title?: string,
 *   subtitle?: string,
 *   sectionId?: string,
 * }} props
 */
export default function NewsRelatedAssets({
  assets = [],
  title = "ما الأسواق المتأثرة؟",
  subtitle = "صفحات Asset Hub والأسواق الأقرب لموضوع هذا الخبر",
  sectionId = "affected-markets",
}) {
  if (!assets.length) {
    return null;
  }

  return (
    <section
      id={sectionId}
      className="mt-6 rounded-[1.75rem] border border-amber-200/70 bg-amber-50/70 p-6 shadow-sm scroll-mt-28"
      dir="rtl"
      aria-label={title}
    >
      <h2 className="text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm font-bold text-slate-500">{subtitle}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        {assets.map((asset) => (
          <Link
            key={asset.id}
            href={asset.path}
            className="group inline-flex min-w-[9rem] flex-col rounded-2xl border border-white/80 bg-white/90 px-4 py-3 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"
          >
            <span className="text-xs font-black uppercase tracking-wide text-cyan-600">
              {asset.symbol}
            </span>
            <span className="mt-1 text-sm font-black text-slate-800 group-hover:text-cyan-700">
              {asset.name}
            </span>
            <span className="mt-2 text-xs font-bold text-slate-400">
              {asset.kind === "market" ? "سوق" : "أصل"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
