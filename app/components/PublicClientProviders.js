"use client";
import { AppModalProvider } from "./AppModalProvider";
import { AuthProvider } from "./AuthProvider";
import { NotificationProvider } from "./notifications/NotificationProvider";
export function PublicClientProviders({ children }) {
  return (
    <AuthProvider>
      
      <NotificationProvider>
        
        <AppModalProvider>{children}</AppModalProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
