import Link from "next/link";
const VARIANTS = {
  dark: {
    nav: "text-sm font-bold ui-public-seo-subtitle",
    link: "ui-public-seo-subtitle no-underline transition hover:admin-text-muted",
    current: "admin-text-muted",
    separator: "ui-public-seo-subtitle",
  },
  light: {
    nav: "text-sm font-bold ui-public-seo-subtitle",
    link: "ui-public-seo-subtitle no-underline transition hover:admin-text-muted",
    current: "ui-public-seo-subtitle",
    separator: "ui-public-seo-body",
  },
};
export default function Breadcrumbs({ items = [], variant = "dark" }) {
  if (!items.length) {
    return null;
  }
  const styles = VARIANTS[variant] || VARIANTS.dark;
  return (
    <nav
      className={`flex flex-wrap items-center gap-2 ${styles.nav}`}
      aria-label="مسار التنقل"
      dir="rtl"
    >
      {" "}
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span
            key={`${item.href}-${item.label}`}
            className="inline-flex items-center gap-2"
          >
            {" "}
            {index > 0 ? (
              <span className={styles.separator} aria-hidden="true">
                &gt;
              </span>
            ) : null}{" "}
            {isLast ? (
              <span className={styles.current} aria-current="page">
                {" "}
                {item.label}{" "}
              </span>
            ) : (
              <Link href={item.href} className={styles.link}>
                {" "}
                {item.label}{" "}
              </Link>
            )}{" "}
          </span>
        );
      })}{" "}
    </nav>
  );
}
