import PublicPageJsonLd from "../../components/public-seo/PublicPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { getPublicSeoPage } from "../../../lib/public-seo-content";

const page = getPublicSeoPage("vip-forex");

export const metadata = buildPublicPageMetadata({
  path: page.path,
  title: page.title,
  description: page.description,
  keywords: page.keywords,
});

export default function VipForexLayout({ children }) {
  return (
    <>
      <PublicPageJsonLd pageKey="vip-forex" />
      {children}
    </>
  );
}
