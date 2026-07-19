import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { dotAssetConfig } from "../../components/asset-hub/configs/dot";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function DotPage() {
  const newsItems = await getAssetNewsItems(dotAssetConfig, 8);
  return <AssetPageTemplate config={dotAssetConfig} newsItems={newsItems} />;
}
