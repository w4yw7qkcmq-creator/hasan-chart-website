import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { daxAssetConfig } from "../../components/asset-hub/configs/dax";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: daxAssetConfig.path,
  title: daxAssetConfig.metadata.title,
  description: daxAssetConfig.metadata.description,
  keywords: daxAssetConfig.metadata.keywords,
});

export default function DaxLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={daxAssetConfig} />
      {children}
    </>
  );
}
