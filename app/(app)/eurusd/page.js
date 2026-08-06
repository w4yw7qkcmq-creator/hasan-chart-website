import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { eurusdAssetConfig } from "../../components/asset-hub/configs/eurusd";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function EurusdPage() {
  const newsItems = await getAssetNewsItems(eurusdAssetConfig, 8);
  return <AssetPageTemplate config={eurusdAssetConfig} newsItems={newsItems} />;
}
