"use client";
export default function AdminHubUrgentQueue({
  items = [],
  loading = false,
  onOpenItem,
}) {
  return (
    <section id="admin-urgent-queue" className="admin-hub-urgent admin-section">
      {" "}
      <div className="admin-hub-section-head">
        {" "}
        <h2 className="admin-heading text-xl">المهام التي تحتاج متابعة</h2>{" "}
        <p className="admin-hub-section-head__desc">
          الطلبات والتنبيهات التي تحتاج تدخلاً سريعاً.
        </p>{" "}
      </div>{" "}
      {loading ? (
        <div className="admin-hub-urgent__grid">
          {" "}
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="admin-hub-urgent-card admin-hub-urgent-card--skeleton animate-pulse"
            />
          ))}{" "}
        </div>
      ) : items.length === 0 ? (
        <div className="admin-premium-empty">
          {" "}
          <span className="admin-premium-empty__icon" aria-hidden="true">
            {" "}
            ✅{" "}
          </span>{" "}
          <p className="admin-premium-empty__title">
            لا توجد مهام عاجلة حالياً.
          </p>{" "}
          <p className="admin-premium-empty__desc">
            ستظهر هنا الطلبات والتنبيهات فور وصولها.
          </p>{" "}
        </div>
      ) : (
        <div className="admin-hub-urgent__grid">
          {" "}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="admin-hub-urgent-card"
              onClick={() => onOpenItem?.(item)}
            >
              {" "}
              <span className="admin-hub-urgent-card__icon" aria-hidden="true">
                {" "}
                {item.icon}{" "}
              </span>{" "}
              <div className="min-w-0 flex-1 text-right">
                {" "}
                <p className="admin-hub-urgent-card__title">
                  {item.title}
                </p>{" "}
                <p className="admin-hub-urgent-card__meta">{item.message}</p>{" "}
                {item.createdAt ? (
                  <p className="admin-hub-urgent-card__time">
                    {item.createdAt}
                  </p>
                ) : null}{" "}
              </div>{" "}
              <span className="admin-hub-urgent-card__chip">
                {item.kindLabel || "متابعة"}
              </span>{" "}
            </button>
          ))}{" "}
        </div>
      )}{" "}
    </section>
  );
}
