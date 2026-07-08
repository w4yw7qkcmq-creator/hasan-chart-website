import PublicPageJsonLd from "../components/public-seo/PublicPageJsonLd";
import { buildPublicPageMetadata } from "../../lib/seo";
import { getPublicSeoPage } from "../../lib/public-seo-content";

const page = getPublicSeoPage("account-management-service");

export const metadata = buildPublicPageMetadata({
  path: page.path,
  title: page.title,
  description: page.description,
  keywords: page.keywords,
});

export default function AccountManagementServiceLayout({ children }) {
  return (
    <>
      <PublicPageJsonLd pageKey="account-management-service" />
      {children}
    </>
  );
}
