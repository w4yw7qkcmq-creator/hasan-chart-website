import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { bnbAssetConfig } from "../../components/asset-hub/configs/bnb";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function BnbPage() {
  const newsItems = await getAssetNewsItems(bnbAssetConfig, 8);

  return <AssetPageTemplate config={bnbAssetConfig} newsItems={newsItems} />;
}
