import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { ftseAssetConfig } from "../../components/asset-hub/configs/ftse";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: ftseAssetConfig.path,
  title: ftseAssetConfig.metadata.title,
  description: ftseAssetConfig.metadata.description,
  keywords: ftseAssetConfig.metadata.keywords,
});
export default function FtseLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={ftseAssetConfig} /> {children}
    </>
  );
}
