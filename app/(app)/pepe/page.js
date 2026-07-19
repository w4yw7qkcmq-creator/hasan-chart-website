import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { pepeAssetConfig } from "../../components/asset-hub/configs/pepe";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function PepePage() {
  const newsItems = await getAssetNewsItems(pepeAssetConfig, 8);
  return <AssetPageTemplate config={pepeAssetConfig} newsItems={newsItems} />;
}
