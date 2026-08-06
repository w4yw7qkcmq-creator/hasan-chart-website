import AssetPageJsonLd from "../../components/asset-hub/AssetPageJsonLd";
import { trxAssetConfig } from "../../components/asset-hub/configs/trx";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_ASSET_HUB } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_ASSET_HUB;
export const metadata = buildPublicPageMetadata({
  path: trxAssetConfig.path,
  title: trxAssetConfig.metadata.title,
  description: trxAssetConfig.metadata.description,
  keywords: trxAssetConfig.metadata.keywords,
});
export default function TrxLayout({ children }) {
  return (
    <>
      
      <AssetPageJsonLd config={trxAssetConfig} /> {children}
    </>
  );
}
