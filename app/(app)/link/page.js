import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { linkAssetConfig } from "../../components/asset-hub/configs/link";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function LinkPage() {
  const newsItems = await getAssetNewsItems(linkAssetConfig, 8);
  return <AssetPageTemplate config={linkAssetConfig} newsItems={newsItems} />;
}
