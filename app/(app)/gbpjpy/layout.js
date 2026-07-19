import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { gbpjpyAssetConfig } from "../../components/asset-hub/configs/gbpjpy";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: gbpjpyAssetConfig.path,
  title: gbpjpyAssetConfig.metadata.title,
  description: gbpjpyAssetConfig.metadata.description,
  keywords: gbpjpyAssetConfig.metadata.keywords,
});

export default function GbpjpyLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={gbpjpyAssetConfig} />
      {children}
    </>
  );
}
