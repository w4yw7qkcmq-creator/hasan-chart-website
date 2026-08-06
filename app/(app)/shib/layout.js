import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { shibAssetConfig } from "../../components/asset-hub/configs/shib";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: shibAssetConfig.path,
  title: shibAssetConfig.metadata.title,
  description: shibAssetConfig.metadata.description,
  keywords: shibAssetConfig.metadata.keywords,
});
export default function ShibLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={shibAssetConfig} /> {children}
    </>
  );
}
