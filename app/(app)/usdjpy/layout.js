import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { usdjpyAssetConfig } from "../../components/asset-hub/configs/usdjpy";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: usdjpyAssetConfig.path,
  title: usdjpyAssetConfig.metadata.title,
  description: usdjpyAssetConfig.metadata.description,
  keywords: usdjpyAssetConfig.metadata.keywords,
});

export default function UsdjpyLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={usdjpyAssetConfig} />
      {children}
    </>
  );
}
