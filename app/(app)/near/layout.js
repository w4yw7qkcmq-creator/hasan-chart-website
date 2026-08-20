import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { nearAssetConfig } from "../../components/asset-hub/configs/near";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: nearAssetConfig.path,
  title: nearAssetConfig.metadata.title,
  description: nearAssetConfig.metadata.description,
  keywords: nearAssetConfig.metadata.keywords,
});

export default function NearLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={nearAssetConfig} />
      {children}
    </>
  );
}
