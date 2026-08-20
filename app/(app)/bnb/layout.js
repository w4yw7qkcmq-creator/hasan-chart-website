import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { bnbAssetConfig } from "../../components/asset-hub/configs/bnb";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: bnbAssetConfig.path,
  title: bnbAssetConfig.metadata.title,
  description: bnbAssetConfig.metadata.description,
  keywords: bnbAssetConfig.metadata.keywords,
});

export default function BnbLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={bnbAssetConfig} />
      {children}
    </>
  );
}
