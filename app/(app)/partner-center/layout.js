import "../../styles/user-dashboard.css";
import PublicPageJsonLd from "../../components/public-seo/PublicPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { getPublicSeoPage } from "../../../lib/public-seo-content";

const page = getPublicSeoPage("partner-center");

export const metadata = buildPublicPageMetadata({
  path: page.path,
  title: page.title,
  description: page.description,
  keywords: page.keywords,
});

export default function PartnerCenterLayout({ children }) {
  return (
    <>
      <PublicPageJsonLd pageKey="partner-center" />
      {children}
    </>
  );
}
