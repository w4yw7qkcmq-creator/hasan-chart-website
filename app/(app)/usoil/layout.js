import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { oilAssetConfig } from "../../components/asset-hub/configs/oil";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: oilAssetConfig.path,
  title: oilAssetConfig.metadata.title,
  description: oilAssetConfig.metadata.description,
  keywords: oilAssetConfig.metadata.keywords,
});

export default function UsoilLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={oilAssetConfig} />
      {children}
    </>
  );
}
