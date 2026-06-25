"use client";

import { createContext, useContext } from "react";
import { useSiteNotifications } from "../../hooks/useSiteNotifications";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const value = useSiteNotifications();

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }

  return context;
}
