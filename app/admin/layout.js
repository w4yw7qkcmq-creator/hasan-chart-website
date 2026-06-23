import { redirect } from "next/navigation";
import { verifyAdminSession } from "../../lib/admin-auth";

export default async function AdminLayout({ children }) {
  const adminCheck = await verifyAdminSession();

  if (!adminCheck.ok) {
    if (adminCheck.status === 401) {
      redirect("/login");
    }

    redirect("/403");
  }

  return children;
}
