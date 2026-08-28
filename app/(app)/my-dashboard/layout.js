import "../../styles/user-dashboard.css";
import { buildPrivateMetadata } from "../../../lib/seo";

export const metadata = buildPrivateMetadata();

export default function MyDashboardLayout({ children }) {
  return children;
}
