import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { nzdusdAssetConfig } from "../../components/asset-hub/configs/nzdusd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: nzdusdAssetConfig.path,
  title: nzdusdAssetConfig.metadata.title,
  description: nzdusdAssetConfig.metadata.description,
  keywords: nzdusdAssetConfig.metadata.keywords,
});
export default function NzdusdLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={nzdusdAssetConfig} /> {children}
    </>
  );
}
