import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { ltcAssetConfig } from "../../components/asset-hub/configs/ltc";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: ltcAssetConfig.path,
  title: ltcAssetConfig.metadata.title,
  description: ltcAssetConfig.metadata.description,
  keywords: ltcAssetConfig.metadata.keywords,
});

export default function LtcLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={ltcAssetConfig} />
      {children}
    </>
  );
}
