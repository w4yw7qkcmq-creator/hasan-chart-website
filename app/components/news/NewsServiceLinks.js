import Link from "next/link";
export default function NewsServiceLinks({ links = [] }) {
  if (!links.length) {
    return null;
  }
  return (
    <section
      className="mt-10 rounded-[1.75rem] border admin-panel-border admin-panel p-6 shadow-sm"
      dir="rtl"
      aria-label="قد يهمك"
    >
      {" "}
      <h2 className="text-xl font-black ui-public-seo-subtitle">
        قد يهمك
      </h2>{" "}
      <p className="mt-2 text-sm font-bold ui-public-seo-subtitle">
        {" "}
        خدمات HasaN CharT World الأقرب لهذا الخبر{" "}
      </p>{" "}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {" "}
        {links.map((link) => (
          <li key={link.href}>
            {" "}
            <Link
              href={link.href}
              className="flex items-center justify-between rounded-2xl border admin-panel-border ui-glass-solid/90 px-4 py-3 text-sm font-black ui-public-seo-subtitle no-underline shadow-sm transition hover:-translate-y-0.5 hover:admin-panel-border hover:admin-text-muted"
            >
              {" "}
              <span>{link.label}</span>{" "}
              <span aria-hidden="true" className="admin-text-muted">
                {" "}
                ←{" "}
              </span>{" "}
            </Link>{" "}
          </li>
        ))}{" "}
      </ul>{" "}
    </section>
  );
}
