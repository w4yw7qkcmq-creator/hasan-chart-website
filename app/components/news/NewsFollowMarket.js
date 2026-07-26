import Link from "next/link";

/**
 * @param {{ links?: Array<{ label: string, description?: string, href: string }> }} props
 */
export default function NewsFollowMarket({ links = [] }) {
  if (!links.length) {
    return null;
  }

  return (
    <section
      className="mt-6 rounded-[1.75rem] border border-emerald-200/70 bg-emerald-50/70 p-6 shadow-sm"
      dir="rtl"
      aria-label="تابع هذا السوق"
    >
      <h2 className="text-xl font-black text-slate-950">تابع هذا السوق</h2>
      <p className="mt-2 text-sm font-bold text-slate-500">
        انتقل مباشرة إلى الأصل والخدمات المرتبطة به
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/90 px-4 py-3 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-700"
            >
              <span>
                <span className="block text-sm font-black text-slate-800">{link.label}</span>
                {link.description ? (
                  <span className="mt-1 block text-xs font-bold text-slate-500">
                    {link.description}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="text-emerald-600">
                ←
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
