import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { dxyAssetConfig } from "../../components/asset-hub/configs/dxy";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: dxyAssetConfig.path,
  title: dxyAssetConfig.metadata.title,
  description: dxyAssetConfig.metadata.description,
  keywords: dxyAssetConfig.metadata.keywords,
});
export default function DxyLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={dxyAssetConfig} /> {children}
    </>
  );
}
