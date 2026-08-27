import { renderPublicSeoP1Page } from "../../../lib/render-public-seo-p1-page";
import VipFuturesPageClient from "./VipFuturesPageClient";

export default async function VipFuturesPage() {
  return renderPublicSeoP1Page({ pageKey: "vip-futures", ClientComponent: VipFuturesPageClient });
}
