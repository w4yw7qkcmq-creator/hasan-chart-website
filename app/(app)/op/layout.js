import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { opAssetConfig } from "../../components/asset-hub/configs/op";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: opAssetConfig.path,
  title: opAssetConfig.metadata.title,
  description: opAssetConfig.metadata.description,
  keywords: opAssetConfig.metadata.keywords,
});
export default function OpLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={opAssetConfig} /> {children}
    </>
  );
}
