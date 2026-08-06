import { buildPrivateMetadata } from "../../../lib/seo";
export const dynamic = "force-dynamic";
export const metadata = buildPrivateMetadata();
export default function LoginLayout({ children }) {
  return children;
}
