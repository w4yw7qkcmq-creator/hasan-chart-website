import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { maticAssetConfig } from "../../components/asset-hub/configs/matic";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function MaticPage() {
  const newsItems = await getAssetNewsItems(maticAssetConfig, 8);
  return <AssetPageTemplate config={maticAssetConfig} newsItems={newsItems} />;
}
