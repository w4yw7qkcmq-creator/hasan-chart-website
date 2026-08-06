"use client";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
export function NotificationSoundSettingsBootstrap() {
  const { authResolved, user } = useAuth();
  useEffect(() => {
    if (!authResolved) return;
    let active = true;
    void import("../../lib/notification-sound-settings-client").then((mod) => {
      if (!active) return;
      if (user?.id) {
        void mod.loadServerNotificationSoundSettings().catch((error) => {
          console.warn(
            "Notification sound settings load failed:",
            error?.message || error,
          );
          mod.bootstrapGuestNotificationSoundSettings();
        });
        return;
      }
      mod.bootstrapLoggedOutNotificationSoundSettings();
    });
    return () => {
      active = false;
    };
  }, [authResolved, user?.id]);
  return null;
}
