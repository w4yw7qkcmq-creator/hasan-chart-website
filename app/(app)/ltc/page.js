import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { ltcAssetConfig } from "../../components/asset-hub/configs/ltc";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function LtcPage() {
  const newsItems = await getAssetNewsItems(ltcAssetConfig, 8);
  return <AssetPageTemplate config={ltcAssetConfig} newsItems={newsItems} />;
}
