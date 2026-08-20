import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { solAssetConfig } from "../../components/asset-hub/configs/sol";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: solAssetConfig.path,
  title: solAssetConfig.metadata.title,
  description: solAssetConfig.metadata.description,
  keywords: solAssetConfig.metadata.keywords,
});

export default function SolLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={solAssetConfig} />
      {children}
    </>
  );
}
