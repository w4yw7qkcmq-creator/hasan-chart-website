import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { sp500AssetConfig } from "../../components/asset-hub/configs/sp500";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: sp500AssetConfig.path,
  title: sp500AssetConfig.metadata.title,
  description: sp500AssetConfig.metadata.description,
  keywords: sp500AssetConfig.metadata.keywords,
});

export default function Sp500Layout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={sp500AssetConfig} />
      {children}
    </>
  );
}
