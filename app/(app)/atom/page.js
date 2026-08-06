import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { atomAssetConfig } from "../../components/asset-hub/configs/atom";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function AtomPage() {
  const newsItems = await getAssetNewsItems(atomAssetConfig, 8);
  return <AssetPageTemplate config={atomAssetConfig} newsItems={newsItems} />;
}
