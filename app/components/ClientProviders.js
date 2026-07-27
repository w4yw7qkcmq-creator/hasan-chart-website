"use client";

import dynamic from "next/dynamic";
import { AppModalProvider } from "./AppModalProvider";
import { AuthProvider } from "./AuthProvider";
import { NotificationProvider } from "./notifications/NotificationProvider";
import { useClientMounted } from "../hooks/useClientMounted";

const NotificationSoundSettingsBootstrap = dynamic(
  () =>
    import("./NotificationSoundSettingsBootstrap").then(
      (mod) => mod.NotificationSoundSettingsBootstrap
    ),
  { ssr: false }
);

const NotificationToastStack = dynamic(
  () =>
    import("./notifications/NotificationToastStack").then(
      (mod) => mod.NotificationToastStack
    ),
  { ssr: false }
);

function DeferredNotificationUi() {
  const mounted = useClientMounted();

  if (!mounted) {
    return null;
  }

  return (
    <>
      <NotificationSoundSettingsBootstrap />
      <NotificationToastStack />
    </>
  );
}

export function ClientProviders({ children }) {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppModalProvider>
          <DeferredNotificationUi />
          {children}
        </AppModalProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
