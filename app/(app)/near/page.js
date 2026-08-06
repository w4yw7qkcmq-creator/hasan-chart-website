import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { nearAssetConfig } from "../../components/asset-hub/configs/near";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function NearPage() {
  const newsItems = await getAssetNewsItems(nearAssetConfig, 8);
  return <AssetPageTemplate config={nearAssetConfig} newsItems={newsItems} />;
}
