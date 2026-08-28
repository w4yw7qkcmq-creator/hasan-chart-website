import "../../styles/notifications-page.css";
import { buildPrivateMetadata } from "../../../lib/seo";

export const metadata = buildPrivateMetadata();

export default function NotificationsLayout({ children }) {
  return children;
}
