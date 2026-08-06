import Link from "next/link";
import "../admin/admin-theme.css";

export const metadata = {
  title: "غير مصرح — Hasan Chart World",
  robots: { index: false, follow: false },
};

export default function ForbiddenPage({ searchParams }) {
  const from = String(searchParams?.from || "").trim();
  const requestId = String(searchParams?.rid || "").trim();
  const isAdminContext = from === "admin";

  return (
    <main
      className="admin-forbidden-page admin-forbidden-page--standalone"
      role="alert"
      aria-labelledby="forbidden-title"
      aria-describedby="forbidden-desc"
    >
      <div className="admin-forbidden-page__panel">
        <div className="admin-forbidden-page__icon" aria-hidden="true">
          🚫
        </div>
        <h1 id="forbidden-title" className="admin-forbidden-page__title">
          غير مصرح لك بالدخول
        </h1>
        <p id="forbidden-desc" className="admin-forbidden-page__desc">
          لا تملك الصلاحية المطلوبة للوصول إلى هذا القسم.
        </p>
        {requestId ? (
          <p className="admin-forbidden-page__rid" aria-label="معرّف الطلب للدعم">
            مرجع الدعم: {requestId}
          </p>
        ) : null}
        <div className="admin-forbidden-page__actions">
          {isAdminContext ? (
            <Link href="/admin" className="admin-forbidden-page__btn admin-forbidden-page__btn--primary">
              العودة إلى لوحة الإدارة
            </Link>
          ) : null}
          <Link
            href="/dashboard"
            className={`admin-forbidden-page__btn${isAdminContext ? "" : " admin-forbidden-page__btn--primary"}`}
          >
            العودة إلى لوحة المستخدم
          </Link>
        </div>
      </div>
    </main>
  );
}
