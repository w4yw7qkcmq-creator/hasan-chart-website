import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { audusdAssetConfig } from "../../components/asset-hub/configs/audusd";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function AudusdPage() {
  const newsItems = await getAssetNewsItems(audusdAssetConfig, 8);
  return <AssetPageTemplate config={audusdAssetConfig} newsItems={newsItems} />;
}
