import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { nasdaqAssetConfig } from "../../components/asset-hub/configs/nasdaq";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function NasdaqPage() {
  const newsItems = await getAssetNewsItems(nasdaqAssetConfig, 8);

  return <AssetPageTemplate config={nasdaqAssetConfig} newsItems={newsItems} />;
}
