import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { cac40AssetConfig } from "../../components/asset-hub/configs/cac40";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function Cac40Page() {
  const newsItems = await getAssetNewsItems(cac40AssetConfig, 8);
  return <AssetPageTemplate config={cac40AssetConfig} newsItems={newsItems} />;
}
