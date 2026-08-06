import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { injAssetConfig } from "../../components/asset-hub/configs/inj";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: injAssetConfig.path,
  title: injAssetConfig.metadata.title,
  description: injAssetConfig.metadata.description,
  keywords: injAssetConfig.metadata.keywords,
});

export default function InjLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={injAssetConfig} />
      {children}
    </>
  );
}
