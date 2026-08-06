"use client";
import { useAuth } from "./AuthProvider"; /** * Arabic 403 fallback for admin sections gated by permission. */
export function AdminPermissionDenied({
  title = "غير مصرح",
  message = "ليس لديك صلاحية للوصول إلى هذا القسم.",
}) {
  return (
    <div className="admin-permission-denied" role="alert">
      {" "}
      <h2>{title}</h2> <p>{message}</p>{" "}
    </div>
  );
} /** * Conditionally render children when the user has the required IAM permission. * Falls back to isAdmin when IAM UI flag is off or permissions not loaded. */
export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  loadingFallback = null,
  children,
}) {
  const { can, isAdmin, iamUiEnabled, iamReady, status } = useAuth();
  const authLoading =
    status === "loading" || status === "restoring" || !iamReady;
  if (authLoading && loadingFallback) {
    return loadingFallback;
  }
  if (!iamUiEnabled || !iamReady) {
    if (!isAdmin) return fallback;
    return children;
  }
  const permList = permissions || (permission ? [permission] : []);
  if (!permList.length) {
    if (!isAdmin) return fallback;
    return children;
  }
  const allowed = requireAll
    ? permList.every((p) => can(p))
    : permList.some((p) => can(p));
  if (!allowed) {
    return fallback ?? <AdminPermissionDenied />;
  }
  return children;
}
