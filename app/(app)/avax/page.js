import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { avaxAssetConfig } from "../../components/asset-hub/configs/avax";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function AvaxPage() {
  const newsItems = await getAssetNewsItems(avaxAssetConfig, 8);
  return <AssetPageTemplate config={avaxAssetConfig} newsItems={newsItems} />;
}
