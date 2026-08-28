"use client";

import { AnalyticsProvider } from "./AnalyticsProvider";
import { AppModalProvider } from "./AppModalProvider";
import { AuthProvider } from "./AuthProvider";
import { NotificationProvider } from "./notifications/NotificationProvider";

export function PublicClientProviders({ children }) {
  return (
    <AnalyticsProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppModalProvider>{children}</AppModalProvider>
        </NotificationProvider>
      </AuthProvider>
    </AnalyticsProvider>
  );
}
