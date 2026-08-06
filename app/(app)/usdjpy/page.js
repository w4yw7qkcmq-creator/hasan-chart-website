import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { usdjpyAssetConfig } from "../../components/asset-hub/configs/usdjpy";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function UsdjpyPage() {
  const newsItems = await getAssetNewsItems(usdjpyAssetConfig, 8);
  return <AssetPageTemplate config={usdjpyAssetConfig} newsItems={newsItems} />;
}
