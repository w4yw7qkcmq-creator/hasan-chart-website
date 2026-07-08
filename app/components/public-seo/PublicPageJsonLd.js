import { buildPublicServiceJsonLd, serializeJsonLd } from "../../../lib/seo";
import { getPublicSeoPage } from "../../../lib/public-seo-content";

export default function PublicPageJsonLd({ pageKey }) {
  const page = getPublicSeoPage(pageKey);

  if (!page) {
    return null;
  }

  const jsonLd = buildPublicServiceJsonLd({
    path: page.path,
    title: page.title,
    description: page.description,
    faq: page.faq,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
