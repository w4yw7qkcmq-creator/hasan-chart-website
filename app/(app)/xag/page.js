import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { silverAssetConfig } from "../../components/asset-hub/configs/silver";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function XagPage() {
  const newsItems = await getAssetNewsItems(silverAssetConfig, 8);

  return <AssetPageTemplate config={silverAssetConfig} newsItems={newsItems} />;
}
