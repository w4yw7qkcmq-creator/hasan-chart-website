import Link from "next/link"; /** * @param {{ links?: Array<{ label: string, description?: string, href: string }> }} props */
export default function NewsFollowMarket({ links = [] }) {
  if (!links.length) {
    return null;
  }
  return (
    <section
      className="mt-6 ui-panel-positive rounded-[1.75rem] p-6 shadow-sm"
      dir="rtl"
      aria-label="تابع هذا السوق"
    >
      {" "}
      <h2 className="text-xl font-black ui-public-seo-subtitle">
        تابع هذا السوق
      </h2>{" "}
      <p className="mt-2 text-sm font-bold ui-public-seo-subtitle">
        {" "}
        انتقل مباشرة إلى الأصل والخدمات المرتبطة به{" "}
      </p>{" "}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {" "}
        {links.map((link) => (
          <li key={link.href + link.label}>
            {" "}
            <Link
              href={link.href}
              className="flex items-center justify-between rounded-2xl border admin-panel-border ui-glass-solid/90 px-4 py-3 no-underline shadow-sm transition hover:-translate-y-0.5 hover:admin-panel-border hover:ui-text-positive"
            >
              {" "}
              <span>
                {" "}
                <span className="block text-sm font-black ui-public-seo-subtitle">
                  {link.label}
                </span>{" "}
                {link.description ? (
                  <span className="mt-1 block text-xs font-bold ui-public-seo-subtitle">
                    {" "}
                    {link.description}{" "}
                  </span>
                ) : null}{" "}
              </span>{" "}
              <span aria-hidden="true" className="ui-text-positive">
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
