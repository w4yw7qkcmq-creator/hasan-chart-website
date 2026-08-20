import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { xrpAssetConfig } from "../../components/asset-hub/configs/xrp";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: xrpAssetConfig.path,
  title: xrpAssetConfig.metadata.title,
  description: xrpAssetConfig.metadata.description,
  keywords: xrpAssetConfig.metadata.keywords,
});

export default function XrpLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={xrpAssetConfig} />
      {children}
    </>
  );
}
