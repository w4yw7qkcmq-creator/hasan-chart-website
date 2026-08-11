"use client";

const LIVE_STATUS_ITEMS = [
  {
    id: "subscriptions",
    label: "طلبات اشتراك جديدة",
    statKey: "pendingSubscriptions",
    icon: "💳",
  },
  {
    id: "accounts",
    label: "حسابات تحتاج مراجعة",
    statKey: "pendingAccounts",
    icon: "💼",
  },
  {
    id: "analysis",
    label: "تحليلات تنتظر الرد",
    statKey: "pendingAnalysis",
    icon: "🧠",
  },
  {
    id: "withdrawals",
    label: "سحوبات بانتظار الموافقة",
    statKey: "withdrawalsPending",
    icon: "🤝",
  },
  {
    id: "notifications",
    label: "إشعارات أدمن جديدة",
    statKey: "adminUnreadCount",
    icon: "🔔",
  },
];

export default function AdminHubLiveStatus({
  stats = {},
  loading = false,
  unavailable = false,
  unavailableMessage = "",
}) {
  if (loading) {
    return (
      <section className="admin-hub-live-status admin-section" aria-label="الحالة اللحظية">
        <div className="admin-hub-live-status__grid">
          {LIVE_STATUS_ITEMS.map((item) => (
            <div key={item.id} className="admin-hub-live-status__chip admin-hub-live-status__chip--skeleton animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (unavailable) {
    return (
      <section className="admin-hub-live-status admin-section" aria-label="الحالة اللحظية">
        <div className="admin-hub-live-status__head">
          <h2 className="admin-heading text-lg">الحالة اللحظية</h2>
          <p className="admin-hub-live-status__desc admin-premium-empty__desc">
            {unavailableMessage || "تعذر تحديث هذه البيانات مؤقتًا"}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-hub-live-status admin-section" aria-label="الحالة اللحظية">
      <div className="admin-hub-live-status__head">
        <h2 className="admin-heading text-lg">الحالة اللحظية</h2>
        <p className="admin-hub-live-status__desc">أرقام حقيقية من لوحة الإدارة — بدون تقديرات.</p>
      </div>
      <div className="admin-hub-live-status__grid">
        {LIVE_STATUS_ITEMS.map((item) => {
          const value = Number(stats[item.statKey] || 0);
          const isHot = value > 0;
          return (
            <article
              key={item.id}
              className={`admin-hub-live-status__chip ${isHot ? "is-hot" : "is-calm"}`}
            >
              <span className="admin-hub-live-status__chip-icon" aria-hidden="true">
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="admin-hub-live-status__chip-label">{item.label}</p>
                <p className="admin-hub-live-status__chip-value">{value.toLocaleString("ar")}</p>
              </div>
              {isHot ? <span className="admin-hub-live-status__chip-flag">متابعة</span> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
