import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { oilAssetConfig } from "../../components/asset-hub/configs/oil";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function UsoilPage() {
  const newsItems = await getAssetNewsItems(oilAssetConfig, 8);

  return <AssetPageTemplate config={oilAssetConfig} newsItems={newsItems} />;
}
