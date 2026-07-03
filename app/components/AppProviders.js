"use client";

import { AppModalProvider } from "./AppModalProvider";
import { AuthProvider } from "./AuthProvider";
import { NotificationSoundSettingsBootstrap } from "./NotificationSoundSettingsBootstrap";
import { NotificationProvider } from "./notifications/NotificationProvider";
import { NotificationToastStack } from "./notifications/NotificationToastStack";
import { ThemeProvider } from "./ThemeProvider";

export function AppProviders({ children, initialTheme }) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <AuthProvider>
        <NotificationSoundSettingsBootstrap />
        <NotificationProvider>
          <AppModalProvider>
            <NotificationToastStack />
            {children}
          </AppModalProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
