import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { filAssetConfig } from "../../components/asset-hub/configs/fil";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: filAssetConfig.path,
  title: filAssetConfig.metadata.title,
  description: filAssetConfig.metadata.description,
  keywords: filAssetConfig.metadata.keywords,
});

export default function FilLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={filAssetConfig} />
      {children}
    </>
  );
}
