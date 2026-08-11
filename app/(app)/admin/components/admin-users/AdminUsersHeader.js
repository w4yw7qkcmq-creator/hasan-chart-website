"use client";

import Link from "next/link";

export default function AdminUsersHeader({
  onRefresh,
  onExportCsv,
  refreshing = false,
  exportDisabled = false,
  exporting = false,
}) {
  return (
    <section className="au-panel au-panel--header">
      <div className="au-panel__head au-panel__head--flat">
        <div className="au-panel__lead">
          <span className="au-panel__icon" aria-hidden="true">
            👥
          </span>
          <div>
            <span className="au-badge">إدارة الحسابات</span>
            <h1 className="au-panel__title">إدارة المستخدمين</h1>
            <p className="au-panel__desc">
              مركز موحد لإدارة الحسابات، النشاط، الاشتراكات والوصول.
            </p>
          </div>
        </div>
        <div className="au-action-bar">
          <button
            type="button"
            className="au-btn au-btn--compact"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <span aria-hidden="true">⟳</span>
            {refreshing ? "جاري التحديث..." : "تحديث البيانات"}
          </button>
          <button
            type="button"
            className="au-btn au-btn--compact au-btn--primary"
            onClick={onExportCsv}
            disabled={exportDisabled || exporting}
            aria-busy={exporting}
          >
            <span aria-hidden="true">⬇</span>
            {exporting ? "جاري التصدير..." : "تصدير النتائج"}
          </button>
          <Link href="/admin" className="au-btn au-btn--compact au-btn--ghost">
            ← لوحة الإدارة
          </Link>
        </div>
      </div>
    </section>
  );
}
