import { renderPublicSeoP1Page } from "../../../lib/render-public-seo-p1-page";
import VipForexPageClient from "./VipForexPageClient";

export default async function VipForexPage() {
  return renderPublicSeoP1Page({ pageKey: "vip-forex", ClientComponent: VipForexPageClient });
}
