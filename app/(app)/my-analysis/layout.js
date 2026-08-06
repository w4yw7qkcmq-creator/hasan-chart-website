import { buildPrivateMetadata } from "../../../lib/seo";

export const metadata = buildPrivateMetadata();

export default function MyAnalysisLayout({ children }) {
  return children;
}
