import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { usdcadAssetConfig } from "../../components/asset-hub/configs/usdcad";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function UsdcadPage() {
  const newsItems = await getAssetNewsItems(usdcadAssetConfig, 8);
  return <AssetPageTemplate config={usdcadAssetConfig} newsItems={newsItems} />;
}
