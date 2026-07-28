/**
 * Verify notification toast routing, icons, and visual types.
 * Run: node scripts/verify-notification-routes.mjs
 */

import {
  NOTIFICATION_TYPES,
  getNotificationHref,
  getNotificationIcon,
  getNotificationVisualType,
  normalizeNotification,
} from "../lib/notifications-shared.js";

const expectations = [
  [NOTIFICATION_TYPES.PRICE_ALERT, "/alerts?tab=notifications", "🔔", "price-alert"],
  [NOTIFICATION_TYPES.ANALYSIS_REPLY, "/my-analysis", "🧠", "analysis-reply"],
  [NOTIFICATION_TYPES.VIP_SPOT, "/vip-spot", "⭐", "vip"],
  [NOTIFICATION_TYPES.VIP_FUTURES, "/vip-futures", "⭐", "vip"],
  [NOTIFICATION_TYPES.SUBSCRIPTION, "/subscriptions", "📧", "subscription"],
  [NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED, "/subscriptions", "📧", "subscription"],
  [NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL, "/subscriptions", "📧", "subscription"],
  ["unknown-type", "/notifications", "⚠️", "general"],
];

let failed = 0;

for (const [type, href, icon, visualType] of expectations) {
  const actualHref = getNotificationHref(type);
  const actualIcon = getNotificationIcon(type);
  const actualVisual = getNotificationVisualType(type);

  if (actualHref !== href || actualIcon !== icon || actualVisual !== visualType) {
    failed += 1;
    console.error(`❌ ${type}:`, { actualHref, actualIcon, actualVisual, expected: { href, icon, visualType } });
  }
}

const normalized = normalizeNotification({
  id: "test-id",
  user_email: "user@test.com",
  title: "Test",
  message: "Hello",
  type: NOTIFICATION_TYPES.PRICE_ALERT,
  is_read: false,
  created_at: new Date().toISOString(),
});

if (!normalized?.href || !normalized?.icon || !normalized?.visualType) {
  failed += 1;
  console.error("❌ normalizeNotification missing toast fields", normalized);
}

if (failed > 0) {
  console.error(`\n${failed} notification route test(s) failed.`);
  process.exit(1);
}

console.log("✅ Notification routes/icons/visual types verified.");
