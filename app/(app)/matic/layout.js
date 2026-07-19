import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { maticAssetConfig } from "../../components/asset-hub/configs/matic";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: maticAssetConfig.path,
  title: maticAssetConfig.metadata.title,
  description: maticAssetConfig.metadata.description,
  keywords: maticAssetConfig.metadata.keywords,
});

export default function MaticLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={maticAssetConfig} />
      {children}
    </>
  );
}
