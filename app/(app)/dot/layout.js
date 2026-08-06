import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { dotAssetConfig } from "../../components/asset-hub/configs/dot";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: dotAssetConfig.path,
  title: dotAssetConfig.metadata.title,
  description: dotAssetConfig.metadata.description,
  keywords: dotAssetConfig.metadata.keywords,
});

export default function DotLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={dotAssetConfig} />
      {children}
    </>
  );
}
