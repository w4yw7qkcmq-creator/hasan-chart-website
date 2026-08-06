import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { arbAssetConfig } from "../../components/asset-hub/configs/arb";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function ArbPage() {
  const newsItems = await getAssetNewsItems(arbAssetConfig, 8);
  return <AssetPageTemplate config={arbAssetConfig} newsItems={newsItems} />;
}
