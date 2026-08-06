import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { nasdaqAssetConfig } from "../../components/asset-hub/configs/nasdaq";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: nasdaqAssetConfig.path,
  title: nasdaqAssetConfig.metadata.title,
  description: nasdaqAssetConfig.metadata.description,
  keywords: nasdaqAssetConfig.metadata.keywords,
});

export default function NasdaqLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={nasdaqAssetConfig} />
      {children}
    </>
  );
}
