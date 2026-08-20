import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { linkAssetConfig } from "../../components/asset-hub/configs/link";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: linkAssetConfig.path,
  title: linkAssetConfig.metadata.title,
  description: linkAssetConfig.metadata.description,
  keywords: linkAssetConfig.metadata.keywords,
});

export default function LinkLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={linkAssetConfig} />
      {children}
    </>
  );
}
