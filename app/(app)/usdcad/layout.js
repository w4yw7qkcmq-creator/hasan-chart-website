import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { usdcadAssetConfig } from "../../components/asset-hub/configs/usdcad";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: usdcadAssetConfig.path,
  title: usdcadAssetConfig.metadata.title,
  description: usdcadAssetConfig.metadata.description,
  keywords: usdcadAssetConfig.metadata.keywords,
});
export default function UsdcadLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={usdcadAssetConfig} /> {children}
    </>
  );
}
