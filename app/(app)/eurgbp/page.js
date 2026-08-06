import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { eurgbpAssetConfig } from "../../components/asset-hub/configs/eurgbp";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function EurgbpPage() {
  const newsItems = await getAssetNewsItems(eurgbpAssetConfig, 8);
  return <AssetPageTemplate config={eurgbpAssetConfig} newsItems={newsItems} />;
}
