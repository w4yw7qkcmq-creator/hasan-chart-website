import Link from "next/link";
import { UiPageShell } from "../../components/ui";
export default function ForbiddenPage() {
  return (
    <UiPageShell className="ui-forbidden-page">
      {" "}
      <div className="ui-forbidden-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
        {" "}
        <div className="ui-public-seo-card ui-public-seo-card--compact max-w-md">
          {" "}
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-[var(--ui-negative-border)] bg-[var(--ui-negative-soft)] text-4xl">
            {" "}
            🚫{" "}
          </div>{" "}
          <h1 className="text-3xl font-black ui-text-strong">
            403 — غير مصرح
          </h1>{" "}
          <p className="mt-3 leading-7 ui-text-muted">
            {" "}
            ليس لديك صلاحية للوصول إلى هذه الصفحة.{" "}
          </p>{" "}
          <Link
            href="/login"
            className="ui-asset-link ui-asset-link--ghost mt-6 inline-flex"
          >
            {" "}
            العودة لتسجيل الدخول{" "}
          </Link>{" "}
        </div>{" "}
      </div>{" "}
    </UiPageShell>
  );
}
