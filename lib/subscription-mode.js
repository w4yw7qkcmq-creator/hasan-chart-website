export function getPlanFlags(planText) {
  const text = String(planText || "").toLowerCase();

  return {
    hasSpot:
      text.includes("spot") ||
      text.includes("سبوت") ||
      text.includes("vip spot"),
    hasFutures:
      text.includes("future") ||
      text.includes("futures") ||
      text.includes("فيوتشر") ||
      text.includes("vip futures"),
    hasForex:
      text.includes("forex") ||
      text.includes("فوركس") ||
      text.includes("vip forex"),
  };
}

export function buildSubscriptionStatusResponse(activePlans = []) {
  const plans = Array.isArray(activePlans) ? activePlans : [];
  const subscriptionPlan = plans
    .map((item) => item.plan_name || item.category)
    .filter(Boolean)
    .join(" | ");
  const flags = getPlanFlags(subscriptionPlan);

  return {
    success: true,
    active: plans.length > 0,
    subscription_status: plans.length > 0 ? "مفعل" : "غير مفعل",
    subscription_plan: subscriptionPlan,
    hasSpot: flags.hasSpot,
    hasFutures: flags.hasFutures,
    hasForex: flags.hasForex,
    plans,
    current_subscription: plans[0] || null,
  };
}
