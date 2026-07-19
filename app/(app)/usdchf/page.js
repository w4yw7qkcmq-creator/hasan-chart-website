import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { usdchfAssetConfig } from "../../components/asset-hub/configs/usdchf";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function UsdchfPage() {
  const newsItems = await getAssetNewsItems(usdchfAssetConfig, 8);
  return <AssetPageTemplate config={usdchfAssetConfig} newsItems={newsItems} />;
}
