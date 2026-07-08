import { PRIVATE_PAGE_METADATA } from "../../lib/seo";
import AdminLayoutClient from "./AdminLayoutClient";

export const metadata = PRIVATE_PAGE_METADATA;

export default function AdminLayout({ children }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
