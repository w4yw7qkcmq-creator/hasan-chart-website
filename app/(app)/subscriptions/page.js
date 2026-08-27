import { renderPublicSeoP1Page } from "../../../lib/render-public-seo-p1-page";
import SubscriptionsPageClient from "./SubscriptionsPageClient";

export default async function SubscriptionsPage() {
  return renderPublicSeoP1Page({
    pageKey: "subscriptions",
    ClientComponent: SubscriptionsPageClient,
  });
}
