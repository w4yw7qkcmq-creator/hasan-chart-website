import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { bchAssetConfig } from "../../components/asset-hub/configs/bch";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function BchPage() {
  const newsItems = await getAssetNewsItems(bchAssetConfig, 8);
  return <AssetPageTemplate config={bchAssetConfig} newsItems={newsItems} />;
}
