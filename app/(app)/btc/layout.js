import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { btcAssetConfig } from "../../components/asset-hub/configs/btc";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = 300;


export const metadata = buildPublicPageMetadata({
  path: btcAssetConfig.path,
  title: btcAssetConfig.metadata.title,
  description: btcAssetConfig.metadata.description,
  keywords: btcAssetConfig.metadata.keywords,
});

export default function BtcLayout({ children }) {
  return (
    <>
      <AssetPageJsonLd config={btcAssetConfig} />
      {children}
    </>
  );
}
