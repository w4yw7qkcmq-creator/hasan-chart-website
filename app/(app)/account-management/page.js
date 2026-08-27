import { renderPublicSeoP1Page } from "../../../lib/render-public-seo-p1-page";
import AccountManagementClient from "./AccountManagementClient";

export default async function AccountManagementPage() {
  return renderPublicSeoP1Page({
    pageKey: "account-management",
    ClientComponent: AccountManagementClient,
  });
}
