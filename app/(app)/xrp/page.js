import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { xrpAssetConfig } from "../../components/asset-hub/configs/xrp";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function XrpPage() {
  const newsItems = await getAssetNewsItems(xrpAssetConfig, 8);

  return <AssetPageTemplate config={xrpAssetConfig} newsItems={newsItems} />;
}
