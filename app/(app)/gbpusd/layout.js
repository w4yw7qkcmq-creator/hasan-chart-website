import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { gbpusdAssetConfig } from "../../components/asset-hub/configs/gbpusd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;


export const metadata = buildPublicPageMetadata({
  path: gbpusdAssetConfig.path,
  title: gbpusdAssetConfig.metadata.title,
  description: gbpusdAssetConfig.metadata.description,
  keywords: gbpusdAssetConfig.metadata.keywords,
});

export default function GbpusdLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={gbpusdAssetConfig} />
      {children}
    </>
  );
}
