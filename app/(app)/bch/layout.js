import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { bchAssetConfig } from "../../components/asset-hub/configs/bch";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: bchAssetConfig.path,
  title: bchAssetConfig.metadata.title,
  description: bchAssetConfig.metadata.description,
  keywords: bchAssetConfig.metadata.keywords,
});

export default function BchLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={bchAssetConfig} />
      {children}
    </>
  );
}
