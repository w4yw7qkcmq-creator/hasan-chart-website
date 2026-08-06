import { buildPublicMetadata } from "../../../lib/seo";
import { getAssetNewsItems } from "./getAssetNewsItems"; /** * @param {import("./configs/types").AssetHubConfig} config */
export function buildAssetHubMetadata(config) {
  return buildPublicMetadata({
    path: config.path,
    title: config.metadata.title,
    description: config.metadata.description,
    keywords: config.metadata.keywords,
  });
} /** * @param {import("./configs/types").AssetHubConfig} config */
export async function loadAssetHubNews(config, limit = 8) {
  return getAssetNewsItems(config, limit);
}
