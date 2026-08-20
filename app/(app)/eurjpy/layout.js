import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { eurjpyAssetConfig } from "../../components/asset-hub/configs/eurjpy";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: eurjpyAssetConfig.path,
  title: eurjpyAssetConfig.metadata.title,
  description: eurjpyAssetConfig.metadata.description,
  keywords: eurjpyAssetConfig.metadata.keywords,
});

export default function EurjpyLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={eurjpyAssetConfig} />
      {children}
    </>
  );
}
