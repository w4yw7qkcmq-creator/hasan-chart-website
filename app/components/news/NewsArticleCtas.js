import Link from "next/link";

/**
 * @param {{ ctas?: Array<{ label: string, description?: string, href: string, icon?: string }> }} props
 */
export default function NewsArticleCtas({ ctas = [] }) {
  if (!ctas.length) {
    return null;
  }

  return (
    <section
      className="mt-8 rounded-[1.75rem] border border-cyan-200/70 bg-gradient-to-br from-cyan-50/90 to-emerald-50/70 p-6 shadow-sm"
      dir="rtl"
      aria-label="إجراءات سريعة"
    >
      <h2 className="text-xl font-black text-slate-950">تابع السوق من هنا</h2>
      <p className="mt-2 text-sm font-bold text-slate-500">
        انتقل مباشرة إلى الخدمات والأصول المرتبطة بهذا الخبر
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {ctas.map((cta) => (
          <Link
            key={cta.href + cta.label}
            href={cta.href}
            className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/95 px-4 py-4 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"
          >
            <span>
              <span className="block text-sm font-black text-slate-800">
                {cta.icon ? `${cta.icon} ` : ""}
                {cta.label}
              </span>
              {cta.description ? (
                <span className="mt-1 block text-xs font-bold text-slate-500">
                  {cta.description}
                </span>
              ) : null}
            </span>
            <span aria-hidden="true" className="text-cyan-600">
              ←
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
