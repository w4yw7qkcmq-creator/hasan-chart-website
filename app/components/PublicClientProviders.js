"use client";

import { AppModalProvider } from "./AppModalProvider";
import { AuthProvider } from "./AuthProvider";
import { NotificationProvider } from "./notifications/NotificationProvider";
import { ThemeProvider } from "./ThemeProvider";

export function PublicClientProviders({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppModalProvider>{children}</AppModalProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
