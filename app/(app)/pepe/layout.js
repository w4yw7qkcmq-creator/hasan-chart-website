import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { pepeAssetConfig } from "../../components/asset-hub/configs/pepe";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: pepeAssetConfig.path,
  title: pepeAssetConfig.metadata.title,
  description: pepeAssetConfig.metadata.description,
  keywords: pepeAssetConfig.metadata.keywords,
});

export default function PepeLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={pepeAssetConfig} />
      {children}
    </>
  );
}
