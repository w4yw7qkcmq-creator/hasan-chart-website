import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { atomAssetConfig } from "../../components/asset-hub/configs/atom";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: atomAssetConfig.path,
  title: atomAssetConfig.metadata.title,
  description: atomAssetConfig.metadata.description,
  keywords: atomAssetConfig.metadata.keywords,
});

export default function AtomLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={atomAssetConfig} />
      {children}
    </>
  );
}
