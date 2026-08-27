import { renderPublicSeoP1Page } from "../../../lib/render-public-seo-p1-page";
import VipSpotPageClient from "./VipSpotPageClient";

export default async function VipSpotPage() {
  return renderPublicSeoP1Page({ pageKey: "vip-spot", ClientComponent: VipSpotPageClient });
}
