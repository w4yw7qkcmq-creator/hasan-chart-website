import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { arbAssetConfig } from "../../components/asset-hub/configs/arb";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: arbAssetConfig.path,
  title: arbAssetConfig.metadata.title,
  description: arbAssetConfig.metadata.description,
  keywords: arbAssetConfig.metadata.keywords,
});
export default function ArbLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={arbAssetConfig} /> {children}
    </>
  );
}
