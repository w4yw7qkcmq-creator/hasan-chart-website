import {
  normalizeUserClassificationFilter,
  resolveEffectiveUserClassification,
  USER_CLASSIFICATION,
} from "./user-classification.js";

export const EFFECTIVE_CLASSIFICATION_SCAN_BATCH_SIZE = 500;

export const EFFECTIVE_CLASSIFICATION_SCAN_COLUMNS =
  "id,email,username,role,telegram,created_at,last_sign_in_at,user_classification,user_classification_source,user_classification_updated_at,subscription_plan,subscription_status,account_status,status_reason,status_updated_at,status_updated_by,suspended_at,banned_at,deleted_at";

export function profileMatchesEffectiveClassification(profile, targetClassification, authUser = null) {
  const normalizedTarget = normalizeUserClassificationFilter(targetClassification);
  if (normalizedTarget === "all") return true;
  const effective = resolveEffectiveUserClassification(profile, authUser);
  return effective.classification === normalizedTarget;
}

export function sortProfilesForAdminList(profiles, sortKey = "created_at", ascending = false) {
  const rows = [...(profiles || [])];
  const field = sortKey === "last_sign_in" ? "last_sign_in_at" : "created_at";

  rows.sort((left, right) => {
    const leftTime = left?.[field] ? new Date(left[field]).getTime() : 0;
    const rightTime = right?.[field] ? new Date(right[field]).getTime() : 0;
    if (leftTime === rightTime) {
      return String(left?.id || "").localeCompare(String(right?.id || ""));
    }
    return ascending ? leftTime - rightTime : rightTime - leftTime;
  });

  return rows;
}

export async function collectProfilesMatchingEffectiveClassification(
  supabase,
  {
    applySharedFilters,
    sharedFiltersWithoutClassification,
    targetClassification,
    scanColumns = EFFECTIVE_CLASSIFICATION_SCAN_COLUMNS,
    batchSize = EFFECTIVE_CLASSIFICATION_SCAN_BATCH_SIZE,
  }
) {
  const normalizedTarget = normalizeUserClassificationFilter(targetClassification);
  if (normalizedTarget === "all") {
    throw new Error("collectProfilesMatchingEffectiveClassification requires a specific classification");
  }

  const matches = [];
  let offset = 0;

  while (true) {
    let query = supabase.from("profiles").select(scanColumns);
    query = applySharedFilters(query, {
      ...sharedFiltersWithoutClassification,
      userClassification: "all",
    });
    query = query.order("created_at", { ascending: false, nullsFirst: false });
    query = query.range(offset, offset + batchSize - 1);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    for (const profile of data) {
      if (profileMatchesEffectiveClassification(profile, normalizedTarget)) {
        matches.push(profile);
      }
    }

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return matches;
}

export function countEffectiveClassifications(profiles = []) {
  const counts = Object.fromEntries(Object.values(USER_CLASSIFICATION).map((key) => [key, 0]));

  for (const profile of profiles) {
    const effective = resolveEffectiveUserClassification(profile).classification;
    counts[effective] = (counts[effective] || 0) + 1;
  }

  return counts;
}
