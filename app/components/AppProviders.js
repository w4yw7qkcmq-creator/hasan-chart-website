"use client";

import { AppModalProvider } from "./AppModalProvider";
import { AuthProvider } from "./AuthProvider";
import { ThemeProvider } from "./ThemeProvider";

export function AppProviders({ children, initialTheme }) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <AuthProvider>
        <AppModalProvider>{children}</AppModalProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
