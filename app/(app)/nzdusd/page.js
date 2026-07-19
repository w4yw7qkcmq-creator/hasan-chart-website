import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { nzdusdAssetConfig } from "../../components/asset-hub/configs/nzdusd";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function NzdusdPage() {
  const newsItems = await getAssetNewsItems(nzdusdAssetConfig, 8);
  return <AssetPageTemplate config={nzdusdAssetConfig} newsItems={newsItems} />;
}
