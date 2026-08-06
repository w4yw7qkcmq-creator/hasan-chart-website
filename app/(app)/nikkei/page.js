import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { nikkeiAssetConfig } from "../../components/asset-hub/configs/nikkei";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function NikkeiPage() {
  const newsItems = await getAssetNewsItems(nikkeiAssetConfig, 8);
  return <AssetPageTemplate config={nikkeiAssetConfig} newsItems={newsItems} />;
}
