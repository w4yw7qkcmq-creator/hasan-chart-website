import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { gbpusdAssetConfig } from "../../components/asset-hub/configs/gbpusd";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function GbpusdPage() {
  const newsItems = await getAssetNewsItems(gbpusdAssetConfig, 8);

  return <AssetPageTemplate config={gbpusdAssetConfig} newsItems={newsItems} />;
}
