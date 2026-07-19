import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { silverAssetConfig } from "../../components/asset-hub/configs/silver";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: silverAssetConfig.path,
  title: silverAssetConfig.metadata.title,
  description: silverAssetConfig.metadata.description,
  keywords: silverAssetConfig.metadata.keywords,
});

export default function XagLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={silverAssetConfig} />
      {children}
    </>
  );
}
