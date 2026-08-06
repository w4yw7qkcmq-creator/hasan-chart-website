import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { solAssetConfig } from "../../components/asset-hub/configs/sol";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function SolPage() {
  const newsItems = await getAssetNewsItems(solAssetConfig, 8);

  return <AssetPageTemplate config={solAssetConfig} newsItems={newsItems} />;
}
