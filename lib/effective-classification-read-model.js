import { USER_CLASSIFICATION } from "./user-classification.js";

export const EFFECTIVE_CLASSIFICATION_COLUMN = "effective_user_classification";
export const EFFECTIVE_CLASSIFICATION_SOURCE_COLUMN = "effective_user_classification_source";

export function profileHasEffectiveClassificationReadModel(profile = {}) {
  return Object.prototype.hasOwnProperty.call(profile, EFFECTIVE_CLASSIFICATION_COLUMN);
}

export function readEffectiveClassificationFromProfile(profile = {}) {
  const classification = String(profile?.[EFFECTIVE_CLASSIFICATION_COLUMN] || "").trim().toLowerCase();
  const source = String(profile?.[EFFECTIVE_CLASSIFICATION_SOURCE_COLUMN] || "").trim().toLowerCase();
  if (!classification || !Object.values(USER_CLASSIFICATION).includes(classification)) {
    return null;
  }
  return {
    classification,
    source: source || "computed",
    confidence: source === "admin_manual" ? "admin" : source === "computed" ? "medium" : "stored",
    signals: [`profiles.${EFFECTIVE_CLASSIFICATION_COLUMN}:${source || "computed"}`],
  };
}

export async function loadEffectiveClassificationCounts(supabase) {
  const { data, error } = await supabase.rpc("admin_profiles_effective_classification_counts");
  if (error) throw error;

  const counts = Object.fromEntries(Object.values(USER_CLASSIFICATION).map((key) => [key, 0]));
  for (const row of data || []) {
    const key = String(row.classification || "").trim().toLowerCase();
    if (counts[key] !== undefined) {
      counts[key] = Number(row.total || 0);
    }
  }

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { counts, total };
}

export function isMissingEffectiveClassificationColumnError(error) {
  return isMissingEffectiveClassificationReadModelError(error);
}

export function isMissingEffectiveClassificationReadModelError(error) {
  const message = error?.message || "";
  const code = error?.code || "";
  return (
    /effective_user_classification/i.test(message) ||
    /admin_profiles_effective_classification_counts/i.test(message) ||
    code === "PGRST202"
  );
}
