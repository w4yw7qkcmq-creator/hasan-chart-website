import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { xauusdAssetConfig } from "../../components/asset-hub/configs/xauusd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: xauusdAssetConfig.path,
  title: xauusdAssetConfig.metadata.title,
  description: xauusdAssetConfig.metadata.description,
  keywords: xauusdAssetConfig.metadata.keywords,
});
export default function XauusdLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={xauusdAssetConfig} /> {children}
    </>
  );
}
