import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { dogeAssetConfig } from "../../components/asset-hub/configs/doge";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function DogePage() {
  const newsItems = await getAssetNewsItems(dogeAssetConfig, 8);

  return <AssetPageTemplate config={dogeAssetConfig} newsItems={newsItems} />;
}
