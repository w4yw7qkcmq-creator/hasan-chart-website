"use client";

import { useAuth } from "../AuthProvider";
import { AuthenticatedNotificationLayer } from "./AuthenticatedNotificationLayer";
import { NotificationContext } from "./notification-context";
import { GUEST_NOTIFICATION_VALUE } from "./notification-guest-stub";

export { useNotifications } from "./notification-context";

export function NotificationProvider({ children }) {
  const { authResolved, user } = useAuth();
  const shouldLoadAuthenticated = authResolved && Boolean(user?.id && user?.email);

  if (!shouldLoadAuthenticated) {
    return (
      <NotificationContext.Provider value={GUEST_NOTIFICATION_VALUE}>
        {children}
      </NotificationContext.Provider>
    );
  }

  return <AuthenticatedNotificationLayer>{children}</AuthenticatedNotificationLayer>;
}
