import { renderPublicSeoP1Page } from "../../../lib/render-public-seo-p1-page";
import PartnerCenterClient from "./PartnerCenterClient";

export default async function PartnerCenterPage() {
  return renderPublicSeoP1Page({
    pageKey: "partner-center",
    ClientComponent: PartnerCenterClient,
  });
}
