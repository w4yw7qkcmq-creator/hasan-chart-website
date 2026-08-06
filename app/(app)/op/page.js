import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { opAssetConfig } from "../../components/asset-hub/configs/op";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function OpPage() {
  const newsItems = await getAssetNewsItems(opAssetConfig, 8);
  return <AssetPageTemplate config={opAssetConfig} newsItems={newsItems} />;
}
