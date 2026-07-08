import PublicPageJsonLd from "../../components/public-seo/PublicPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { getPublicSeoPage } from "../../../lib/public-seo-content";

const page = getPublicSeoPage("analysis-request");

export const metadata = buildPublicPageMetadata({
  path: page.path,
  title: page.title,
  description: page.description,
  keywords: page.keywords,
});

export default function AnalysisRequestLayout({ children }) {
  return (
    <>
      <PublicPageJsonLd pageKey="analysis-request" />
      {children}
    </>
  );
}
