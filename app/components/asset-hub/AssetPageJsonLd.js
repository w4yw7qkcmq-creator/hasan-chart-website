import { buildAssetPageJsonLd, serializeJsonLd } from "../../../lib/seo";

/**
 * @param {{ config: import("./configs/types").AssetHubConfig }} props
 */
export default function AssetPageJsonLd({ config }) {
  const jsonLd = buildAssetPageJsonLd({
    path: config.path,
    title: config.metadata.title,
    description: config.metadata.description,
    items: config.links.jsonLd,
    faq: config.faq,
    asset: config.jsonLd,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
