import PublicPageJsonLd from "../../components/public-seo/PublicPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { getPublicSeoPage } from "../../../lib/public-seo-content";
const page = getPublicSeoPage("trading-academy");
export const metadata = buildPublicPageMetadata({
  path: page.path,
  title: page.title,
  description: page.description,
  keywords: page.keywords,
});
export default function TradingAcademyLayout({ children }) {
  return (
    <>
      
      <PublicPageJsonLd pageKey="trading-academy" /> {children}
    </>
  );
}
