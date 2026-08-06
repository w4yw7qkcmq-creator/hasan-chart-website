/** * @param {{ * newsType: string, * affectedMarket: string, * impactLabel?: string | null, * publishedAt: string, * publishedAtIso?: string | null, * updatedAt?: string | null, * updatedAtIso?: string | null, * showUpdatedAt?: boolean, * }} props */
export default function NewsQuickSummary({
  newsType,
  affectedMarket,
  impactLabel = null,
  publishedAt,
  publishedAtIso = null,
  updatedAt = null,
  updatedAtIso = null,
  showUpdatedAt = false,
}) {
  const items = [
    { label: "نوع الخبر", value: newsType },
    { label: "السوق المتأثر", value: affectedMarket },
    impactLabel ? { label: "درجة التأثير", value: impactLabel } : null,
    { label: "وقت النشر", value: publishedAt, dateTime: publishedAtIso },
    showUpdatedAt && updatedAt
      ? { label: "آخر تحديث", value: updatedAt, dateTime: updatedAtIso }
      : null,
  ].filter(Boolean);
  return (
    <section
      className="mb-6 rounded-[1.5rem] border border-[var(--ui-border)]200 bg-slate-50/90 p-5 shadow-sm"
      dir="rtl"
      aria-label="ملخص سريع"
    >
      {" "}
      <h2 className="mb-4 text-lg font-black ui-public-seo-subtitle">
        ملخص سريع
      </h2>{" "}
      <dl className="grid gap-3 sm:grid-cols-2">
        {" "}
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border admin-panel-border ui-glass-solid px-4 py-3 shadow-sm"
          >
            {" "}
            <dt className="text-xs font-black admin-text-muted">
              {item.label}
            </dt>{" "}
            <dd className="mt-1 text-sm font-bold leading-7 ui-public-seo-subtitle">
              {" "}
              {item.dateTime ? (
                <time dateTime={item.dateTime}>{item.value}</time>
              ) : (
                item.value
              )}{" "}
            </dd>{" "}
          </div>
        ))}{" "}
      </dl>{" "}
    </section>
  );
}
