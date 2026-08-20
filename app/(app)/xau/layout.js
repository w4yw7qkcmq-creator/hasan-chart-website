import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { goldAssetConfig } from "../../components/asset-hub/configs/gold";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: goldAssetConfig.path,
  title: goldAssetConfig.metadata.title,
  description: goldAssetConfig.metadata.description,
  keywords: goldAssetConfig.metadata.keywords,
});

export default function XauLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={goldAssetConfig} />
      {children}
    </>
  );
}
