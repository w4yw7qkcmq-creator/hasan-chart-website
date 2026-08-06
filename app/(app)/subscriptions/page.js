"use client";

import dynamic from "next/dynamic";
const PublicServiceLanding = dynamic(
  () =>
    import("../../components/public-seo/PublicServiceLanding").then(
      (mod) => mod.default
    ),
  { ssr: false }
);
import { useRequireAuth } from "../../hooks/useRequireAuth";

const SubscriptionsAuthenticated = dynamic(() => import("./SubscriptionsAuthenticated"), {
  ssr: false,
  loading: () => (
    <main className="subscriptions-page">
      <div className="subscriptions-page__bg" aria-hidden="true" />
      <div className="subscriptions-page__inner">
        <div className="subscriptions-state subscriptions-state--loading" role="status">
          <span className="subscriptions-state__icon" aria-hidden="true">
            ⏳
          </span>
          <h1 className="subscriptions-state__title">جاري تحميل الاشتراكات…</h1>
          <p className="subscriptions-state__text">نحضّر باقات الاشتراك لحسابك.</p>
        </div>
      </div>
    </main>
  ),
});

export default function SubscriptionsPage() {
  const { user, sessionPending, isAuthenticated, shouldShowLogin } = useRequireAuth();

  if (sessionPending) {
    return (
      <main className="subscriptions-page">
        <div className="subscriptions-page__bg" aria-hidden="true" />
        <div className="subscriptions-page__inner">
          <div className="subscriptions-state subscriptions-state--loading" role="status">
            <span className="subscriptions-state__icon" aria-hidden="true">
              ⏳
            </span>
            <h1 className="subscriptions-state__title">جاري التحقق من الجلسة…</h1>
            <p className="subscriptions-state__text">
              نتحقق من حالة تسجيل الدخول قبل عرض باقات الاشتراك.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (shouldShowLogin || !isAuthenticated) {
    return <PublicServiceLanding pageKey="subscriptions" />;
  }

  return <SubscriptionsAuthenticated user={user} />;
}
