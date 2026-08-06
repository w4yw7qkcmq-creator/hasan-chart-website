import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { daxAssetConfig } from "../../components/asset-hub/configs/dax";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function DaxPage() {
  const newsItems = await getAssetNewsItems(daxAssetConfig, 8);
  return <AssetPageTemplate config={daxAssetConfig} newsItems={newsItems} />;
}
