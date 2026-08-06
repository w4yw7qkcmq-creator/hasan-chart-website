import Link from "next/link"; /** * @param {{ points?: Array<{ label: string, href: string, note: string }> }} props */
export default function NewsWatchPoints({ points = [] }) {
  if (!points.length) {
    return null;
  }
  return (
    <section
      className="mt-6 rounded-[1.75rem] border border-violet-200/70 bg-violet-50/70 p-6 shadow-sm"
      dir="rtl"
      aria-label="ماذا تراقب بعد هذا الخبر"
    >
      {" "}
      <h2 className="text-xl font-black ui-public-seo-subtitle">
        ماذا تراقب بعد هذا الخبر؟
      </h2>{" "}
      <p className="mt-2 text-sm font-bold ui-public-seo-subtitle">
        {" "}
        نقاط مراقبة عامة حسب نوع الخبر — ليست توصية استثمارية{" "}
      </p>{" "}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {" "}
        {points.map((point) => (
          <li key={point.href + point.label}>
            {" "}
            <Link
              href={point.href}
              className="block rounded-2xl border admin-panel-border ui-glass-solid/90 px-4 py-3 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300"
            >
              {" "}
              <span className="block text-sm font-black ui-public-seo-subtitle">
                {point.label}
              </span>{" "}
              <span className="mt-1 block text-xs font-bold leading-6 ui-public-seo-subtitle">
                {" "}
                {point.note}{" "}
              </span>{" "}
            </Link>{" "}
          </li>
        ))}{" "}
      </ul>{" "}
    </section>
  );
}
