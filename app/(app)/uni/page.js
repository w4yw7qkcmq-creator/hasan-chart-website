import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { uniAssetConfig } from "../../components/asset-hub/configs/uni";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function UniPage() {
  const newsItems = await getAssetNewsItems(uniAssetConfig, 8);
  return <AssetPageTemplate config={uniAssetConfig} newsItems={newsItems} />;
}
