import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { dowjonesAssetConfig } from "../../components/asset-hub/configs/dowjones";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function DowjonesPage() {
  const newsItems = await getAssetNewsItems(dowjonesAssetConfig, 8);

  return <AssetPageTemplate config={dowjonesAssetConfig} newsItems={newsItems} />;
}
