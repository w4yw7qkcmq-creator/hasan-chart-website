"use client";

import { useSiteNotifications } from "../../hooks/useSiteNotifications";
import { NotificationContext } from "./notification-context";

export { useNotifications } from "./notification-context";

export function NotificationProvider({ children }) {
  const value = useSiteNotifications();

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
