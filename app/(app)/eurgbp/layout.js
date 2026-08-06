import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { eurgbpAssetConfig } from "../../components/asset-hub/configs/eurgbp";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: eurgbpAssetConfig.path,
  title: eurgbpAssetConfig.metadata.title,
  description: eurgbpAssetConfig.metadata.description,
  keywords: eurgbpAssetConfig.metadata.keywords,
});
export default function EurgbpLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={eurgbpAssetConfig} /> {children}
    </>
  );
}
