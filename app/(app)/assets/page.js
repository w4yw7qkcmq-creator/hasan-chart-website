import AssetsIndexPage from "../../components/asset-hub/AssetsIndexPage";
import {
  getAssetsIndexGroups,
  getAssetsIndexItems,
} from "../../components/asset-hub/assetIndexHelpers";

export default function AssetsPage() {
  const allItems = getAssetsIndexItems();
  const groups = getAssetsIndexGroups();

  return (
    <AssetsIndexPage
      groups={groups}
      allItems={allItems}
      totalCount={allItems.length}
    />
  );
}
