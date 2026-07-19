import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { goldAssetConfig } from "../../components/asset-hub/configs/gold";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function XauPage() {
  const newsItems = await getAssetNewsItems(goldAssetConfig, 8);

  return <AssetPageTemplate config={goldAssetConfig} newsItems={newsItems} />;
}
