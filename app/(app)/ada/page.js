import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { adaAssetConfig } from "../../components/asset-hub/configs/ada";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function AdaPage() {
  const newsItems = await getAssetNewsItems(adaAssetConfig, 8);
  return <AssetPageTemplate config={adaAssetConfig} newsItems={newsItems} />;
}
