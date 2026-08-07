import assert from "node:assert/strict";
import { test } from "node:test";
import { SUBSCRIPTION_PLANS } from "../app/(app)/subscriptions/subscriptionsHelpers.js";
import { normalizeAdminUserServiceType } from "../lib/admin-user-service-classifier.js";
import {
  getSubscriptionDurationDays,
} from "../lib/admin-subscription-request-activate-shared.js";
import {
  matchesSignalSubscription,
  normalizeVipSignalType,
} from "../lib/vip-recommendation-eligibility.js";
import {
  getVipSignalPagePath,
  getVipSiteNotificationType,
  signalTypeBadge,
  signalTypeLabel,
} from "../lib/vip-signal-types.js";
import { getPlanFlags } from "../lib/subscription-mode.js";
import { validatePaymentNetwork } from "../lib/payment-networks.js";

const FOREX_PLANS = SUBSCRIPTION_PLANS.filter((plan) => plan.category === "باقات الفوركس");

test("Forex pricing matches Futures tiers", () => {
  assert.equal(FOREX_PLANS.length, 3);
  assert.deepEqual(
    FOREX_PLANS.map((plan) => plan.price),
    ["$99", "$250", "$800"]
  );
  assert.deepEqual(
    FOREX_PLANS.map((plan) => plan.name),
    ["فوركس - شهر", "فوركس - 3 أشهر", "فوركس - سنة"]
  );
});

test("Forex plan activation durations reuse existing lifecycle", () => {
  assert.equal(getSubscriptionDurationDays("فوركس - شهر"), 30);
  assert.equal(getSubscriptionDurationDays("فوركس - 3 أشهر"), 90);
  assert.equal(getSubscriptionDurationDays("فوركس - سنة"), 365);
});

test("Forex signal type normalization and routes", () => {
  assert.equal(normalizeVipSignalType("forex"), "forex");
  assert.equal(normalizeVipSignalType("فوركس - شهر"), "forex");
  assert.equal(signalTypeLabel("forex"), "Forex");
  assert.equal(signalTypeBadge("forex"), "Forex 💱");
  assert.equal(getVipSignalPagePath("forex"), "/vip-forex");
  assert.equal(getVipSiteNotificationType("forex"), "vip-forex");
});

test("Forex eligibility matrix", () => {
  const forexPlan = "فوركس - شهر باقات الفوركس";

  assert.equal(matchesSignalSubscription(forexPlan, "forex"), true);
  assert.equal(matchesSignalSubscription(forexPlan, "futures"), false);
  assert.equal(matchesSignalSubscription(forexPlan, "spot"), false);

  assert.equal(matchesSignalSubscription("فيوتشر - شهر", "forex"), false);
  assert.equal(matchesSignalSubscription("سبوت - شهر", "forex"), false);

  assert.equal(matchesSignalSubscription("فيوتشر - شهر", "futures"), true);
  assert.equal(matchesSignalSubscription("سبوت - شهر", "spot"), true);
});

test("Subscription mode flags include Forex", () => {
  const flags = getPlanFlags("فوركس - 3 أشهر");
  assert.equal(flags.hasForex, true);
  assert.equal(flags.hasFutures, false);
  assert.equal(flags.hasSpot, false);
});

test("Admin classifier recognizes Forex subscriptions", () => {
  assert.equal(
    normalizeAdminUserServiceType({
      plan_name: "فوركس - شهر",
      category: "باقات الفوركس",
    }),
    "vip_forex"
  );
  assert.notEqual(
    normalizeAdminUserServiceType({
      plan_name: "فيوتشر - شهر",
      category: "باقات الفيوتشر",
    }),
    "vip_forex"
  );
});

test("Payment networks remain reusable for Forex checkout", () => {
  assert.equal(validatePaymentNetwork("BEP20").ok, true);
  assert.equal(validatePaymentNetwork("TRC20").ok, true);
});

test("VIP Forex public landing has safe CTA hrefs for guests", async () => {
  const { getPublicSeoPage } = await import("../lib/public-seo-content/index.js");
  const page = getPublicSeoPage("vip-forex");
  assert.ok(page, "vip-forex public seo page exists");
  assert.equal(typeof page.startHref, "string");
  assert.ok(page.startHref.startsWith("/"));
  for (const cta of page.ctaLinks || []) {
    assert.ok(cta.href, `ctaLinks href missing for ${cta.label}`);
  }
});
