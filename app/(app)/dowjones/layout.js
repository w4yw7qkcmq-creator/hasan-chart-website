import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { dowjonesAssetConfig } from "../../components/asset-hub/configs/dowjones";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: dowjonesAssetConfig.path,
  title: dowjonesAssetConfig.metadata.title,
  description: dowjonesAssetConfig.metadata.description,
  keywords: dowjonesAssetConfig.metadata.keywords,
});

export default function DowjonesLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={dowjonesAssetConfig} />
      {children}
    </>
  );
}
