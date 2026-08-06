import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { nikkeiAssetConfig } from "../../components/asset-hub/configs/nikkei";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: nikkeiAssetConfig.path,
  title: nikkeiAssetConfig.metadata.title,
  description: nikkeiAssetConfig.metadata.description,
  keywords: nikkeiAssetConfig.metadata.keywords,
});
export default function NikkeiLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={nikkeiAssetConfig} /> {children}
    </>
  );
}
