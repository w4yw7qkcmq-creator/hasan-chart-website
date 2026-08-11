"use client";

import Link from "next/link";

export default function PartnerAdminHeader({ onHealthCheck }) {
  return (
    <header className="pa-hero admin-animate-in">
      <div className="pa-hero__content">
        <span className="pa-hero__badge">مركز إدارة الشركاء</span>
        <h1 className="pa-hero__title">إدارة برنامج الشركاء</h1>
        <p className="pa-hero__subtitle">
          مركز موحّد لإدارة الشركاء، العمولات، المكافآت، الحملات، السحوبات والمراجعة.
        </p>
      </div>
      <div className="pa-hero__actions">
        <Link href="/admin/partners/settings" className="pa-btn pa-btn--ghost">
          <span className="pa-btn__icon" aria-hidden="true">
            ⚙️
          </span>
          إعدادات الأتمتة
        </Link>
        <button type="button" className="pa-btn pa-btn--ghost" onClick={onHealthCheck}>
          <span className="pa-btn__icon" aria-hidden="true">
            🩺
          </span>
          فحص النظام
        </button>
        <Link href="/admin" className="pa-btn pa-btn--secondary">
          <span className="pa-btn__icon" aria-hidden="true">
            ←
          </span>
          العودة للوحة الإدارة
        </Link>
      </div>
    </header>
  );
}
