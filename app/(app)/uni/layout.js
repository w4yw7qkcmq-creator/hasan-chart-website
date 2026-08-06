import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { uniAssetConfig } from "../../components/asset-hub/configs/uni";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: uniAssetConfig.path,
  title: uniAssetConfig.metadata.title,
  description: uniAssetConfig.metadata.description,
  keywords: uniAssetConfig.metadata.keywords,
});
export default function UniLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={uniAssetConfig} /> {children}
    </>
  );
}
