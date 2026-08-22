import { EMAIL_CATEGORIES } from "../email-categories.js";
import { isHardSuppressionReason } from "../email-suppression.js";
import { evaluateEmailSendPolicy, normalizePolicyEmail } from "./evaluate.js";

const PROFILES_TABLE = "profiles";
const PREFS_TABLE = "email_marketing_preferences";
const SUPPRESSIONS_TABLE = "email_suppressions";

export async function countEligibleProfiles(supabase, profiles, category = EMAIL_CATEGORIES.MARKETING) {
  let eligible = 0;
  const exclusionBreakdown = {};

  for (const profile of profiles) {
    const evaluation = await evaluateEmailSendPolicy(supabase, {
      userId: profile.id,
      email: normalizePolicyEmail(profile.email),
      category,
      messageType: "audience-preview",
    });

    if (evaluation.allowed) {
      eligible += 1;
    } else if (evaluation.reason) {
      exclusionBreakdown[evaluation.reason] = (exclusionBreakdown[evaluation.reason] || 0) + 1;
    }
  }

  return { eligible, exclusionBreakdown };
}

/**
 * Aggregate marketing audience counts for admin UI (no individual emails).
 */
export async function getMarketingAudienceAggregateCounts(supabase) {
  const { data: profiles, error: profilesError } = await supabase
    .from(PROFILES_TABLE)
    .select("id, email, deleted_at, account_status")
    .not("email", "is", null)
    .is("deleted_at", null)
    .neq("account_status", "deleted")
    .neq("account_status", "banned")
    .limit(10000);

  if (profilesError) {
    throw new Error(profilesError.message || "Failed to load profiles for audience counts");
  }

  const rows = (profiles || []).filter((p) => String(p.email || "").includes("@"));
  const totalAccounts = rows.length;

  const { data: prefsRows, error: prefsError } = await supabase
    .from(PREFS_TABLE)
    .select("user_id, marketing_opt_in, global_unsubscribed_at, opted_in_at, opted_out_at");

  if (prefsError) {
    throw new Error(prefsError.message || "Failed to load marketing preferences");
  }

  const prefsByUser = new Map((prefsRows || []).map((r) => [r.user_id, r]));

  let marketingOptedIn = 0;
  let marketingOptedOut = 0;
  let neverOptedIn = 0;

  for (const profile of rows) {
    const pref = prefsByUser.get(profile.id);
    if (pref?.marketing_opt_in === true) {
      marketingOptedIn += 1;
    } else if (pref?.global_unsubscribed_at) {
      marketingOptedOut += 1;
    } else {
      neverOptedIn += 1;
    }
  }

  const { data: suppressions, error: suppError } = await supabase
    .from(SUPPRESSIONS_TABLE)
    .select("normalized_email, reason, active")
    .eq("active", true);

  if (suppError) {
    throw new Error(suppError.message || "Failed to load suppressions");
  }

  const hardSuppressedEmails = new Set();
  for (const row of suppressions || []) {
    if (isHardSuppressionReason(row.reason)) {
      hardSuppressedEmails.add(String(row.normalized_email || "").toLowerCase());
    }
  }

  const { eligible, exclusionBreakdown } = await countEligibleProfiles(
    supabase,
    rows,
    EMAIL_CATEGORIES.MARKETING
  );

  return {
    totalAccounts,
    marketingOptedIn,
    marketingOptedOut,
    neverOptedIn,
    hardSuppressed: hardSuppressedEmails.size,
    campaignEligible: eligible,
    exclusionBreakdown,
    marketingEligibleRate:
      totalAccounts > 0 ? Number((eligible / totalAccounts).toFixed(4)) : 0,
  };
}

/** Consent population report for E3 closure (no email addresses). */
export async function getMarketingConsentPopulationReport(supabase) {
  const counts = await getMarketingAudienceAggregateCounts(supabase);
  return {
    totalAccounts: counts.totalAccounts,
    existingExplicitOptedIn: counts.marketingOptedIn,
    existingOptedOut: counts.marketingOptedOut,
    neverOptedIn: counts.neverOptedIn,
    hardSuppressed: counts.hardSuppressed,
    marketingEligible: counts.campaignEligible,
    marketingEligibleRate: counts.marketingEligibleRate,
  };
}
