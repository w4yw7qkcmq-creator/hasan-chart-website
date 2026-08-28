"use client";

import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildAnalyticsPagePath,
  getAnalyticsMeasurementId,
  initAnalytics,
  isAnalyticsEnabled,
  isAnalyticsRouteAllowed,
  trackPageView,
} from "../../lib/analytics";

function AnalyticsRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef("");

  useEffect(() => {
    if (!isAnalyticsEnabled() || !pathname || !isAnalyticsRouteAllowed(pathname)) return;

    const pagePath = buildAnalyticsPagePath(pathname, searchParams);
    if (lastTrackedRef.current === pagePath) return;

    lastTrackedRef.current = pagePath;
    trackPageView(pagePath, { pathname, searchParams });
  }, [pathname, searchParams]);

  return null;
}

export function AnalyticsProvider({ children }) {
  const measurementId = getAnalyticsMeasurementId();

  useEffect(() => {
    if (!measurementId) return;
    initAnalytics(measurementId);
  }, [measurementId]);

  return (
    <>
      {measurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="hc-ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function gtag(){window.dataLayer.push(arguments);};`}
          </Script>
        </>
      ) : null}
      <Suspense fallback={null}>
        <AnalyticsRouteTracker />
      </Suspense>
      {children}
    </>
  );
}
