import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_PLAN_REGISTRY,
  assertUploadSessionPlanIntegrity,
  getSubscriptionPlanById,
  resolveSubscriptionPlan,
} from "../lib/subscription-plan-registry.js";
import { SUBSCRIPTION_PLANS } from "../app/(app)/subscriptions/subscriptionsHelpers.js";
import { validatePaymentNetwork } from "../lib/payment-networks.js";

test("registry includes Spot, Futures, and Forex plans", () => {
  assert.equal(SUBSCRIPTION_PLAN_REGISTRY.length, 9);
  assert.ok(getSubscriptionPlanById(SUBSCRIPTION_PLAN_IDS.FOREX_MONTH));
  assert.ok(getSubscriptionPlanById(SUBSCRIPTION_PLAN_IDS.SPOT_MONTH));
  assert.ok(getSubscriptionPlanById(SUBSCRIPTION_PLAN_IDS.FUTURES_MONTH));
});

test("UI plans stay aligned with server registry names/prices", () => {
  for (const uiPlan of SUBSCRIPTION_PLANS) {
    const resolved = resolveSubscriptionPlan({
      plan_name: uiPlan.name,
      category: uiPlan.category,
    });
    assert.equal(resolved.ok, true, `missing registry for ${uiPlan.name}`);
    assert.equal(resolved.plan.price, uiPlan.price);
  }
});

test("valid Spot/Futures/Forex plans resolve with canonical server price", () => {
  for (const id of [
    SUBSCRIPTION_PLAN_IDS.SPOT_MONTH,
    SUBSCRIPTION_PLAN_IDS.FUTURES_3_MONTHS,
    SUBSCRIPTION_PLAN_IDS.FOREX_YEAR,
  ]) {
    const plan = getSubscriptionPlanById(id);
    const resolved = resolveSubscriptionPlan({
      plan_id: id,
      plan_name: plan.planName,
      category: plan.category,
      price: "$1",
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.plan.price, plan.price);
    assert.equal(resolved.ignoredClientPrice, true);
  }
});

test("price tampering is ignored at resolution and blocked in session integrity", () => {
  const tamperedPrices = ["$1", "$0", "$50", "$1000", "-5", "abc", ""];
  for (const price of tamperedPrices) {
    const resolved = resolveSubscriptionPlan({
      plan_name: "فوركس - شهر",
      category: "باقات الفوركس",
      price,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.plan.price, "$99");
    const integrity = assertUploadSessionPlanIntegrity({
      plan_name: "فوركس - شهر",
      category: "باقات الفوركس",
      price,
    });
    if (price === "$99") {
      assert.equal(integrity.ok, true);
    } else {
      assert.equal(integrity.ok, false);
      assert.equal(integrity.code, "SESSION_PLAN_TAMPERED");
    }
  }
});

test("unknown plans are rejected", () => {
  for (const plan_name of ["forex_super_vip", "anything", ""]) {
    const resolved = resolveSubscriptionPlan({
      plan_name,
      category: "باقات الفوركس",
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.code, plan_name ? "UNKNOWN_PLAN" : "MISSING_PLAN");
  }
});

test("category spoof is rejected", () => {
  const forexSpoof = resolveSubscriptionPlan({
    plan_name: "فوركس - شهر",
    category: "باقات الفيوتشر",
  });
  assert.equal(forexSpoof.ok, false);
  assert.equal(forexSpoof.code, "CATEGORY_MISMATCH");

  const futuresSpoof = resolveSubscriptionPlan({
    plan_name: "فيوتشر - شهر",
    category: "باقات الفوركس",
  });
  assert.equal(futuresSpoof.ok, false);
  assert.equal(futuresSpoof.code, "CATEGORY_MISMATCH");
});

test("payment network allowlist", () => {
  assert.equal(validatePaymentNetwork("BEP20").ok, true);
  assert.equal(validatePaymentNetwork("TRC20").ok, true);
  assert.equal(validatePaymentNetwork("ETH_MAINNET").ok, false);
});

test("finalize session integrity blocks plan switching after init", () => {
  const initSession = {
    plan_name: "فوركس - شهر",
    category: "باقات الفوركس",
    price: "$99",
  };
  assert.equal(assertUploadSessionPlanIntegrity(initSession).ok, true);

  const switched = {
    plan_name: "فوركس - سنة",
    category: "باقات الفوركس",
    price: "$800",
  };
  assert.equal(assertUploadSessionPlanIntegrity(switched).ok, true);

  const tamperedSwitch = {
    plan_name: "فوركس - سنة",
    category: "باقات الفوركس",
    price: "$99",
  };
  assert.equal(assertUploadSessionPlanIntegrity(tamperedSwitch).ok, false);
  assert.equal(assertUploadSessionPlanIntegrity(tamperedSwitch).code, "SESSION_PLAN_TAMPERED");
});

test("plan id contract rejects mismatched category", () => {
  const resolved = resolveSubscriptionPlan({
    plan_id: SUBSCRIPTION_PLAN_IDS.FOREX_MONTH,
    category: "باقات السبوت",
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "CATEGORY_MISMATCH");
});
