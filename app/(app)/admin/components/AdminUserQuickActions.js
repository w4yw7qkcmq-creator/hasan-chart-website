"use client";

const ACTIONS = [
  {
    id: "export-csv",
    label: "تصدير CSV",
    icon: "📊",
    description: "تصدير القائمة الحالية",
    tooltip: "تصدير المستخدمين المعروضين حالياً إلى ملف CSV",
  },
  {
    id: "refresh",
    label: "تحديث البيانات",
    icon: "⟳",
    description: "إعادة تحميل القائمة والمؤشرات",
    tooltip: "إعادة تحميل قائمة المستخدمين ومؤشرات لوحة التحكم",
  },
];

export default function AdminUserQuickActions({ onAction, disabled = false }) {
  return (
    <section className="admin-user-quick-actions">
      <p className="admin-user-hero__eyebrow">إجراءات سريعة</p>
      <div className="admin-user-quick-actions__grid">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            className="admin-user-quick-actions__card"
            onClick={() => onAction(action.id)}
            title={action.tooltip}
            aria-label={action.label}
          >
            <span className="admin-user-quick-actions__icon" aria-hidden="true">
              {action.icon}
            </span>
            <span className="admin-user-quick-actions__label">{action.label}</span>
            <span className="admin-user-quick-actions__desc">{action.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
