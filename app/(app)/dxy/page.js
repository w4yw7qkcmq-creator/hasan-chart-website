import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { dxyAssetConfig } from "../../components/asset-hub/configs/dxy";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";
export default async function DxyPage() {
  const newsItems = await getAssetNewsItems(dxyAssetConfig, 8);
  return <AssetPageTemplate config={dxyAssetConfig} newsItems={newsItems} />;
}
