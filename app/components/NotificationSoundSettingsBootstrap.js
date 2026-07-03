"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import {
  bootstrapGuestNotificationSoundSettings,
  bootstrapLoggedOutNotificationSoundSettings,
  loadServerNotificationSoundSettings,
} from "../../lib/notification-sound-settings-client";

export function NotificationSoundSettingsBootstrap() {
  const { authResolved, user } = useAuth();

  useEffect(() => {
    if (!authResolved) return;

    if (user?.id) {
      void loadServerNotificationSoundSettings().catch((error) => {
        console.warn(
          "Notification sound settings load failed:",
          error?.message || error
        );
        bootstrapGuestNotificationSoundSettings();
      });
      return;
    }

    bootstrapLoggedOutNotificationSoundSettings();
  }, [authResolved, user?.id]);

  return null;
}
