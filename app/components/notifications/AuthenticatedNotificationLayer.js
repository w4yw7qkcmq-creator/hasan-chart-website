"use client";

import { useEffect, useState } from "react";
import { NotificationContext } from "./notification-context";
import { GUEST_NOTIFICATION_VALUE } from "./notification-guest-stub";

export function AuthenticatedNotificationLayer({ children }) {
  const [Provider, setProvider] = useState(null);

  useEffect(() => {
    let active = true;

    void import("./AuthenticatedNotificationProvider").then((mod) => {
      if (active) {
        setProvider(() => mod.AuthenticatedNotificationProvider);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (!Provider) {
    return (
      <NotificationContext.Provider value={GUEST_NOTIFICATION_VALUE}>
        {children}
      </NotificationContext.Provider>
    );
  }

  return <Provider>{children}</Provider>;
}
