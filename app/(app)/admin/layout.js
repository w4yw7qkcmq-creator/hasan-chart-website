import { buildPrivateMetadata } from "../../../lib/seo";
import AdminServerGuard from "./AdminServerGuard";

export const metadata = buildPrivateMetadata();

export default function AdminLayout({ children }) {
  return <AdminServerGuard>{children}</AdminServerGuard>;
}
