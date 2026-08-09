import { isPartnerGrowthEngineEnabled } from "./feature-flags.js";

export const GROWTH_RUNTIME_DISABLED = Object.freeze({
  processed: false,
  skipped: true,
  reason: "growth_engine_disabled",
});

export function isGrowthRuntimeEnabled() {
  return isPartnerGrowthEngineEnabled();
}

export function growthRuntimeDisabledResult(extra = {}) {
  return { ...GROWTH_RUNTIME_DISABLED, ...extra };
}

export function requireGrowthRuntimeOrSkip() {
  if (!isGrowthRuntimeEnabled()) {
    return GROWTH_RUNTIME_DISABLED;
  }
  return null;
}

export function assertGrowthEngineForActivation(status) {
  if (String(status || "").trim() === "active" && !isGrowthRuntimeEnabled()) {
    const err = new Error("growth_engine_required_for_activation");
    err.code = "GROWTH_ENGINE_REQUIRED";
    throw err;
  }
}
