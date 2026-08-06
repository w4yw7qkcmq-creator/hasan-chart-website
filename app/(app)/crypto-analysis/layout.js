import PublicPageJsonLd from "../../components/public-seo/PublicPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { getPublicSeoPage } from "../../../lib/public-seo-content";
const page = getPublicSeoPage("crypto-analysis");
export const metadata = buildPublicPageMetadata({
  path: page.path,
  title: page.title,
  description: page.description,
  keywords: page.keywords,
});
export default function CryptoAnalysisLayout({ children }) {
  return (
    <>
      
      <PublicPageJsonLd pageKey="crypto-analysis" /> {children}
    </>
  );
}
