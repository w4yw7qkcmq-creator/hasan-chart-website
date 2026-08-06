import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { aaveAssetConfig } from "../../components/asset-hub/configs/aave";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: aaveAssetConfig.path,
  title: aaveAssetConfig.metadata.title,
  description: aaveAssetConfig.metadata.description,
  keywords: aaveAssetConfig.metadata.keywords,
});

export default function AaveLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={aaveAssetConfig} />
      {children}
    </>
  );
}
