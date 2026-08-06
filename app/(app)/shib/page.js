import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { shibAssetConfig } from "../../components/asset-hub/configs/shib";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function ShibPage() {
  const newsItems = await getAssetNewsItems(shibAssetConfig, 8);
  return <AssetPageTemplate config={shibAssetConfig} newsItems={newsItems} />;
}
