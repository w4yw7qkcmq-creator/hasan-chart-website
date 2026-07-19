import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { cac40AssetConfig } from "../../components/asset-hub/configs/cac40";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: cac40AssetConfig.path,
  title: cac40AssetConfig.metadata.title,
  description: cac40AssetConfig.metadata.description,
  keywords: cac40AssetConfig.metadata.keywords,
});

export default function Cac40Layout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={cac40AssetConfig} />
      {children}
    </>
  );
}
