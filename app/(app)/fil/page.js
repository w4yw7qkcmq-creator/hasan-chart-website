import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { filAssetConfig } from "../../components/asset-hub/configs/fil";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function FilPage() {
  const newsItems = await getAssetNewsItems(filAssetConfig, 8);
  return <AssetPageTemplate config={filAssetConfig} newsItems={newsItems} />;
}
