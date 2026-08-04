import { getIamFeatureFlags, validateIamFlagCombination } from "./feature-flags.js";

/** Runtime IAM flags for canary/ops — booleans only, no secrets or env raw values. */
export function buildIamRuntimeProbe() {
  const flags = getIamFeatureFlags();
  const validation = validateIamFlagCombination(flags);

  return {
    effective: {
      IAM_DB: Boolean(flags.IAM_DB),
      IAM_API: Boolean(flags.IAM_API),
      IAM_UI: Boolean(flags.IAM_UI),
      IAM_RLS: Boolean(flags.IAM_RLS),
    },
    validation: {
      ok: Boolean(validation.ok),
    },
    probeTimestamp: new Date().toISOString(),
  };
}
