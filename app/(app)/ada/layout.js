import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { adaAssetConfig } from "../../components/asset-hub/configs/ada";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: adaAssetConfig.path,
  title: adaAssetConfig.metadata.title,
  description: adaAssetConfig.metadata.description,
  keywords: adaAssetConfig.metadata.keywords,
});
export default function AdaLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={adaAssetConfig} /> {children}
    </>
  );
}
