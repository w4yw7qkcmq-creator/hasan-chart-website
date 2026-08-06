import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { ethAssetConfig } from "../../components/asset-hub/configs/eth";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: ethAssetConfig.path,
  title: ethAssetConfig.metadata.title,
  description: ethAssetConfig.metadata.description,
  keywords: ethAssetConfig.metadata.keywords,
});
export default function EthLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={ethAssetConfig} /> {children}
    </>
  );
}
