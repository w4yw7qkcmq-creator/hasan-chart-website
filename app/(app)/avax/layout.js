import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { avaxAssetConfig } from "../../components/asset-hub/configs/avax";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: avaxAssetConfig.path,
  title: avaxAssetConfig.metadata.title,
  description: avaxAssetConfig.metadata.description,
  keywords: avaxAssetConfig.metadata.keywords,
});

export default function AvaxLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={avaxAssetConfig} />
      {children}
    </>
  );
}
