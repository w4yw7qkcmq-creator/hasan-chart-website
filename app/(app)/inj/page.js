import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { injAssetConfig } from "../../components/asset-hub/configs/inj";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function InjPage() {
  const newsItems = await getAssetNewsItems(injAssetConfig, 8);
  return <AssetPageTemplate config={injAssetConfig} newsItems={newsItems} />;
}
