import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { ethAssetConfig } from "../../components/asset-hub/configs/eth";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function EthPage() {
  const newsItems = await getAssetNewsItems(ethAssetConfig, 8);

  return <AssetPageTemplate config={ethAssetConfig} newsItems={newsItems} />;
}
