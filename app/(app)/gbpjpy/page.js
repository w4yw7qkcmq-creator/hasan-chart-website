import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { gbpjpyAssetConfig } from "../../components/asset-hub/configs/gbpjpy";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function GbpjpyPage() {
  const newsItems = await getAssetNewsItems(gbpjpyAssetConfig, 8);
  return <AssetPageTemplate config={gbpjpyAssetConfig} newsItems={newsItems} />;
}
