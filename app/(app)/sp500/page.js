import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { sp500AssetConfig } from "../../components/asset-hub/configs/sp500";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function Sp500Page() {
  const newsItems = await getAssetNewsItems(sp500AssetConfig, 8);
  return <AssetPageTemplate config={sp500AssetConfig} newsItems={newsItems} />;
}
