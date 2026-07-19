import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { xauusdAssetConfig } from "../../components/asset-hub/configs/xauusd";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function XauusdPage() {
  const newsItems = await getAssetNewsItems(xauusdAssetConfig, 8);

  return <AssetPageTemplate config={xauusdAssetConfig} newsItems={newsItems} />;
}
