"use client";

import dynamic from "next/dynamic";
import { RequireAuthGuestLandingGate } from "../../components/public-seo/GuestPublicLandingGate";

const SubscriptionsAuthenticated = dynamic(() => import("./SubscriptionsAuthenticated"), {
  ssr: false,
  loading: () => <SubscriptionsAuthenticatedPendingShell />,
});

function SubscriptionsAuthenticatedPendingShell() {
  return (
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
  );
}

export default function SubscriptionsPageClient({ landing, initialAuthenticated = false }) {
  return (
    <RequireAuthGuestLandingGate
      landing={landing}
      initialAuthenticated={initialAuthenticated}
      authenticatedPendingFallback={<SubscriptionsAuthenticatedPendingShell />}
    >
      {({ user }) => <SubscriptionsAuthenticated user={user} />}
    </RequireAuthGuestLandingGate>
  );
}
