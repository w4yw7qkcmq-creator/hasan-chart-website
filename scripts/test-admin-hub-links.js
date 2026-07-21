import assert from "node:assert/strict";
import {
  ADMIN_HUB_QUICK_NAV_ITEMS,
} from "../app/(app)/admin/components/admin-hub-config.js";

function testHubQuickNavLinks() {
  const expected = {
    users: { href: "/admin/users", title: "المستخدمون" },
    financial: { href: "/admin/financial-center", title: "المركز المالي" },
    partners: { href: "/admin/partners", title: "الشركاء" },
    email: { href: "/admin/email-analytics", title: "مراقبة الإيميلات" },
    "notification-test": { href: "/admin/notification-test", title: "اختبار الإشعارات" },
    analysis: { tab: "analysis", title: "التحليلات" },
    accounts: { tab: "accounts", title: "الحسابات" },
    alerts: { href: "/alerts", title: "التنبيهات" },
    subscriptions: { tab: "subscriptions", title: "الاشتراكات" },
  };

  assert.equal(ADMIN_HUB_QUICK_NAV_ITEMS.length, 9);

  for (const item of ADMIN_HUB_QUICK_NAV_ITEMS) {
    const spec = expected[item.id];
    assert.ok(spec, `missing expected spec for ${item.id}`);
    if (spec.href) assert.equal(item.href, spec.href);
    if (spec.tab) assert.equal(item.tab, spec.tab);
    if (spec.title) assert.equal(item.title, spec.title);
    assert.ok(item.description && item.icon);
  }
}

const tests = [["admin hub quick navigation links", testHubQuickNavLinks]];

for (const [name, runner] of tests) {
  runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} admin hub link tests passed`);
