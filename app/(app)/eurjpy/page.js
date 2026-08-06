import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { eurjpyAssetConfig } from "../../components/asset-hub/configs/eurjpy";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function EurjpyPage() {
  const newsItems = await getAssetNewsItems(eurjpyAssetConfig, 8);
  return <AssetPageTemplate config={eurjpyAssetConfig} newsItems={newsItems} />;
}
