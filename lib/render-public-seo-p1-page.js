import PublicServiceLanding from "../app/components/public-seo/PublicServiceLanding";
import { getPublicSeoInitialAuth } from "./public-seo-server-auth";

/**
 * Central server render for the six P1 SEO routes.
 * Guests/crawlers receive SSR PublicServiceLanding; authenticated users skip it.
 */
export async function renderPublicSeoP1Page({ pageKey, ClientComponent }) {
  const { isAuthenticated } = await getPublicSeoInitialAuth();

  if (isAuthenticated) {
    return <ClientComponent initialAuthenticated />;
  }

  return (
    <ClientComponent landing={<PublicServiceLanding pageKey={pageKey} />} />
  );
}
