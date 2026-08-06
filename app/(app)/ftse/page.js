import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { ftseAssetConfig } from "../../components/asset-hub/configs/ftse";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function FtsePage() {
  const newsItems = await getAssetNewsItems(ftseAssetConfig, 8);
  return <AssetPageTemplate config={ftseAssetConfig} newsItems={newsItems} />;
}
