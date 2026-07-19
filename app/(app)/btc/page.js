import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { btcAssetConfig } from "../../components/asset-hub/configs/btc";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function BtcPage() {
  const newsItems = await getAssetNewsItems(btcAssetConfig, 8);

  return <AssetPageTemplate config={btcAssetConfig} newsItems={newsItems} />;
}
