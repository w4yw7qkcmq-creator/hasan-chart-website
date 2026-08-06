import Link from "next/link";
import "../admin/admin-theme.css";

const REASON_COPY = {
  not_admin: {
    title: "غير مصرح لك بالدخول",
    description: "حسابك مسجل الدخول لكنه لا يملك صلاحيات الإدارة.",
    backHref: "/dashboard",
    backLabel: "العودة إلى لوحة المستخدم",
  },
  missing_permission: {
    title: "غير مصرح لك بالدخول",
    description: "لا تملك الصلاحية المطلوبة للوصول إلى هذا القسم.",
    backHref: "/admin",
    backLabel: "العودة إلى لوحة الإدارة",
  },
  unmapped_page: {
    title: "غير مصرح لك بالدخول",
    description: "لا تملك الصلاحية المطلوبة للوصول إلى هذا القسم.",
    backHref: "/admin",
    backLabel: "العودة إلى لوحة الإدارة",
  },
  default: {
    title: "غير مصرح لك بالدخول",
    description: "لا تملك الصلاحية المطلوبة للوصول إلى هذا القسم.",
    backHref: "/dashboard",
    backLabel: "العودة",
  },
};

export default function AdminForbiddenPage({ reason = "default", isAdmin = false, requestId = null }) {
  const copy = REASON_COPY[reason] || REASON_COPY.default;
  const backHref = isAdmin || reason === "missing_permission" ? "/admin" : copy.backHref;
  const backLabel =
    isAdmin || reason === "missing_permission" ? "العودة إلى لوحة الإدارة" : copy.backLabel;

  return (
    <main
      className="admin-forbidden-page"
      role="alert"
      aria-labelledby="admin-forbidden-title"
      aria-describedby="admin-forbidden-desc"
    >
      <div className="admin-forbidden-page__panel">
        <div className="admin-forbidden-page__icon" aria-hidden="true">
          🚫
        </div>
        <h1 id="admin-forbidden-title" className="admin-forbidden-page__title">
          {copy.title}
        </h1>
        <p id="admin-forbidden-desc" className="admin-forbidden-page__desc">
          {copy.description}
        </p>
        {requestId ? (
          <p className="admin-forbidden-page__rid" aria-label="معرّف الطلب للدعم">
            مرجع الدعم: {requestId}
          </p>
        ) : null}
        <div className="admin-forbidden-page__actions">
          <Link href={backHref} className="admin-forbidden-page__btn admin-forbidden-page__btn--primary">
            {backLabel}
          </Link>
          {backHref !== "/dashboard" ? (
            <Link href="/dashboard" className="admin-forbidden-page__btn">
              لوحة المستخدم
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
