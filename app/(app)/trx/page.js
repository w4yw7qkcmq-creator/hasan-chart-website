import AssetPageTemplate from "../../components/asset-hub/AssetPageTemplate";
import { trxAssetConfig } from "../../components/asset-hub/configs/trx";
import { getAssetNewsItems } from "../../components/asset-hub/getAssetNewsItems";

export default async function TrxPage() {
  const newsItems = await getAssetNewsItems(trxAssetConfig, 8);
  return <AssetPageTemplate config={trxAssetConfig} newsItems={newsItems} />;
}
