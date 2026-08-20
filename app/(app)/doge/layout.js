import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { dogeAssetConfig } from "../../components/asset-hub/configs/doge";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: dogeAssetConfig.path,
  title: dogeAssetConfig.metadata.title,
  description: dogeAssetConfig.metadata.description,
  keywords: dogeAssetConfig.metadata.keywords,
});

export default function DogeLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={dogeAssetConfig} />
      {children}
    </>
  );
}
