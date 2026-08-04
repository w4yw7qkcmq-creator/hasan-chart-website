import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_HUB_QUICK_NAV_ITEMS,
  filterAdminNavByPermission,
} from "../app/(app)/admin/components/admin-hub-config.js";
import { validateIamFlagCombination } from "../lib/iam/feature-flags.js";

function canFactory(perms) {
  const set = new Set(perms);
  return (p) => set.has(p);
}

describe("Staging UI nav matrix", () => {
  it("IAM_UI=true flag combo valid with IAM_API", () => {
    const r = validateIamFlagCombination({
      IAM_DB: true,
      IAM_API: true,
      IAM_UI: true,
      IAM_RLS: false,
    });
    assert.equal(r.ok, true);
  });

  it("subscription_manager sees subscriptions not IAM", () => {
    const can = canFactory([
      "dashboard.read",
      "subscriptions.read",
      "subscriptions.manage",
      "finance.proofs.read",
    ]);
    const nav = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, can, {
      iamUiEnabled: true,
      isAdmin: true,
    });
    assert.ok(nav.some((i) => i.id === "subscriptions" || i.tab === "subscriptions"));
    assert.ok(!nav.some((i) => i.id === "iam"));
    assert.ok(!nav.some((i) => i.id === "financial"));
  });

  it("support hides finance and IAM", () => {
    const can = canFactory(["users.read", "users.manage", "support.manage", "dashboard.read", "subscriptions.read"]);
    const nav = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, can, {
      iamUiEnabled: true,
      isAdmin: true,
    });
    assert.ok(!nav.some((i) => i.id === "financial"));
    assert.ok(!nav.some((i) => i.id === "iam"));
  });

  it("news_editor sees news admin nav only", () => {
    const can = canFactory(["news.read", "news.manage", "news.publish", "dashboard.read"]);
    const nav = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, can, {
      iamUiEnabled: true,
      isAdmin: true,
    });
    assert.ok(nav.some((i) => i.id === "news"));
    assert.ok(!nav.some((i) => i.id === "iam"));
    assert.ok(!nav.some((i) => i.id === "financial"));
  });

  it("normal user gets alerts only when not admin", () => {
    const nav = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, () => false, {
      iamUiEnabled: true,
      isAdmin: false,
    });
    assert.equal(nav.length, 1);
    assert.equal(nav[0].href, "/alerts");
  });
});
