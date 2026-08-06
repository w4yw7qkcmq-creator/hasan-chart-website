import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { aaveAssetConfig } from "../../components/asset-hub/configs/aave";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function AavePage() {
  const newsItems = await getAssetNewsItems(aaveAssetConfig, 8);
  return <AssetPageTemplate config={aaveAssetConfig} newsItems={newsItems} />;
}
