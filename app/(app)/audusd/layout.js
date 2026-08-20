import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { audusdAssetConfig } from "../../components/asset-hub/configs/audusd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: audusdAssetConfig.path,
  title: audusdAssetConfig.metadata.title,
  description: audusdAssetConfig.metadata.description,
  keywords: audusdAssetConfig.metadata.keywords,
});

export default function AudusdLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={audusdAssetConfig} />
      {children}
    </>
  );
}
