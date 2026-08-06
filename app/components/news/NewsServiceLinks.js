import Link from "next/link";

export default function NewsServiceLinks({ links = [] }) {
  if (!links.length) {
    return null;
  }

  return (
    <section
      className="mt-10 rounded-[1.75rem] border border-cyan-200/70 bg-cyan-50/70 p-6 shadow-sm"
      dir="rtl"
      aria-label="قد يهمك"
    >
      <h2 className="text-xl font-black text-slate-950">قد يهمك</h2>
      <p className="mt-2 text-sm font-bold text-slate-500">
        خدمات HasaN CharT World الأقرب لهذا الخبر
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-black text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:text-cyan-700"
            >
              <span>{link.label}</span>
              <span aria-hidden="true" className="text-cyan-600">
                ←
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
