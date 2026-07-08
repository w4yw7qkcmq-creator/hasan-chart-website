import Link from "next/link";

const VARIANTS = {
  dark: {
    nav: "text-sm font-bold text-slate-400",
    link: "text-slate-400 no-underline transition hover:text-cyan-300",
    current: "text-cyan-200",
    separator: "text-slate-600",
  },
  light: {
    nav: "text-sm font-bold text-slate-500",
    link: "text-slate-500 no-underline transition hover:text-cyan-700",
    current: "text-slate-800",
    separator: "text-slate-300",
  },
};

export default function Breadcrumbs({ items = [], variant = "dark" }) {
  if (!items.length) {
    return null;
  }

  const styles = VARIANTS[variant] || VARIANTS.dark;

  return (
    <nav className={`flex flex-wrap items-center gap-2 ${styles.nav}`} aria-label="مسار التنقل" dir="rtl">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={`${item.href}-${item.label}`} className="inline-flex items-center gap-2">
            {index > 0 ? <span className={styles.separator} aria-hidden="true">&gt;</span> : null}
            {isLast ? (
              <span className={styles.current} aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className={styles.link}>
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
