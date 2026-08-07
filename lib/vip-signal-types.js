/**
 * Shared VIP signal type helpers (spot / futures / forex).
 */

export function normalizeVipSignalType(value) {
  const text = String(value || "").trim().toLowerCase();

  if (
    text === "forex" ||
    text.includes("forex") ||
    text.includes("فوركس") ||
    text.includes("fx ")
  ) {
    return "forex";
  }

  if (
    text.includes("future") ||
    text.includes("futures") ||
    text.includes("فيوتشر") ||
    text.includes("عقود")
  ) {
    return "futures";
  }

  return "spot";
}

export function signalTypeLabel(signalType) {
  const normalized = normalizeVipSignalType(signalType);
  if (normalized === "futures") return "Futures";
  if (normalized === "forex") return "Forex";
  return "Spot";
}

export function signalTypeBadge(signalType) {
  const normalized = normalizeVipSignalType(signalType);
  if (normalized === "futures") return "Futures 🔥";
  if (normalized === "forex") return "Forex 💱";
  return "Spot ⭐";
}

export function getVipSignalPagePath(signalType) {
  const normalized = normalizeVipSignalType(signalType);
  if (normalized === "futures") return "/vip-futures";
  if (normalized === "forex") return "/vip-forex";
  return "/vip-spot";
}

export function getVipSiteNotificationType(signalType) {
  const normalized = normalizeVipSignalType(signalType);
  if (normalized === "futures") return "vip-futures";
  if (normalized === "forex") return "vip-forex";
  return "vip-spot";
}

export function matchesForexPlanText(planText) {
  const text = String(planText || "").toLowerCase();
  return (
    text.includes("forex") ||
    text.includes("فوركس") ||
    text.includes("vip forex")
  );
}

export function matchesFuturesPlanText(planText) {
  const text = String(planText || "").toLowerCase();
  return (
    text.includes("future") ||
    text.includes("futures") ||
    text.includes("فيوتشر") ||
    text.includes("vip futures") ||
    text.includes("عقود")
  );
}

export function matchesSpotPlanText(planText) {
  const text = String(planText || "").toLowerCase();
  return text.includes("spot") || text.includes("سبوت") || text.includes("vip spot");
}
