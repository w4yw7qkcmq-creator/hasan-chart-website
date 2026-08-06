import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { usdchfAssetConfig } from "../../components/asset-hub/configs/usdchf";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: usdchfAssetConfig.path,
  title: usdchfAssetConfig.metadata.title,
  description: usdchfAssetConfig.metadata.description,
  keywords: usdchfAssetConfig.metadata.keywords,
});

export default function UsdchfLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={usdchfAssetConfig} />
      {children}
    </>
  );
}
