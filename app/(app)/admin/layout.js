import { buildPrivateMetadata } from "../../../lib/seo";
import AdminLayoutClient from "./AdminLayoutClient";

export const metadata = buildPrivateMetadata();

export default function AdminLayout({ children }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
