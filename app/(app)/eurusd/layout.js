import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { eurusdAssetConfig } from "../../components/asset-hub/configs/eurusd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: eurusdAssetConfig.path,
  title: eurusdAssetConfig.metadata.title,
  description: eurusdAssetConfig.metadata.description,
  keywords: eurusdAssetConfig.metadata.keywords,
});

export default function EurusdLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={eurusdAssetConfig} />
      {children}
    </>
  );
}
