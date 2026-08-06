import { requireIamPageAccess } from "../../../lib/iam/require-iam-page.js";
import { headers } from "next/headers";
import AdminForbiddenPage from "./AdminForbiddenPage";
import AdminLayoutClient from "./AdminLayoutClient";

export default async function AdminServerGuard({ children }) {
  const headerStore = headers();
  const pathname =
    headerStore.get("x-pathname") ||
    headerStore.get("x-admin-pathname") ||
    "/admin";

  try {
    const access = await requireIamPageAccess(pathname, { redirect: false });

    if (!access.ok) {
      return (
        <AdminForbiddenPage
          reason={access.reason}
          isAdmin={access.reason === "missing_permission"}
          requestId={headerStore.get("x-request-id")}
        />
      );
    }

    return <AdminLayoutClient>{children}</AdminLayoutClient>;
  } catch {
    return (
      <AdminForbiddenPage
        reason="not_admin"
        requestId={headerStore.get("x-request-id")}
      />
    );
  }
}
