import { createRequire } from "node:module";
import { EMAIL_CATEGORIES } from "../email-categories.js";
import { isHardSuppressionReason } from "../email-suppression.js";
import { normalizePolicyEmail } from "./evaluate.js";
import { EXCLUSION_REASONS } from "./constants.js";

const require = createRequire(import.meta.url);
const { blockProductionTestRecipientSend } = require("../email-recipient-guard.cjs");

const PROFILES_TABLE = "profiles";
const PREFS_TABLE = "email_marketing_preferences";
const SUPPRESSIONS_TABLE = "email_suppressions";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function evaluateMarketingEligibleInMemory(profile, prefsByUser, hardSuppressedEmails) {
  const normalizedEmail = normalizePolicyEmail(profile.email);

  if (!normalizedEmail) {
    return { allowed: false, reason: EXCLUSION_REASONS.MISSING_EMAIL };
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return { allowed: false, reason: EXCLUSION_REASONS.INVALID_EMAIL_FORMAT };
  }

  const recipientBlocked = blockProductionTestRecipientSend({
    path: "lib/email-policy/audience-metrics.js::evaluateMarketingEligibleInMemory",
    to: normalizedEmail,
  });

  if (recipientBlocked) {
    return {
      allowed: false,
      reason: recipientBlocked.reason || EXCLUSION_REASONS.PRODUCTION_RECIPIENT_BLOCKED,
    };
  }

  if (hardSuppressedEmails.has(normalizedEmail)) {
    return { allowed: false, reason: EXCLUSION_REASONS.HARD_SUPPRESSED };
  }

  const pref = prefsByUser.get(profile.id);
  if (pref?.global_unsubscribed_at) {
    return { allowed: false, reason: EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED };
  }

  if (pref?.marketing_opt_in !== true) {
    return { allowed: false, reason: EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN };
  }

  return { allowed: true, reason: null };
}

function countEligibleFromSnapshot(profiles, prefsByUser, hardSuppressedEmails) {
  let eligible = 0;
  const exclusionBreakdown = {};

  for (const profile of profiles) {
    const evaluation = evaluateMarketingEligibleInMemory(profile, prefsByUser, hardSuppressedEmails);
    if (evaluation.allowed) {
      eligible += 1;
    } else if (evaluation.reason) {
      exclusionBreakdown[evaluation.reason] = (exclusionBreakdown[evaluation.reason] || 0) + 1;
    }
  }

  return { eligible, exclusionBreakdown };
}

/** @deprecated Prefer countEligibleFromSnapshot when prefs/suppressions are preloaded. */
export async function countEligibleProfiles(supabase, profiles, category = EMAIL_CATEGORIES.MARKETING) {
  if (category !== EMAIL_CATEGORIES.MARKETING) {
    const { evaluateEmailSendPolicy } = await import("./evaluate.js");
    let eligible = 0;
    const exclusionBreakdown = {};
    for (const profile of profiles) {
      const evaluation = await evaluateEmailSendPolicy(supabase, {
        userId: profile.id,
        email: normalizePolicyEmail(profile.email),
        category,
        messageType: "audience-preview",
      });
      if (evaluation.allowed) eligible += 1;
      else if (evaluation.reason) {
        exclusionBreakdown[evaluation.reason] = (exclusionBreakdown[evaluation.reason] || 0) + 1;
      }
    }
    return { eligible, exclusionBreakdown };
  }

  const { data: prefsRows } = await supabase
    .from(PREFS_TABLE)
    .select("user_id, marketing_opt_in, global_unsubscribed_at");

  const prefsByUser = new Map((prefsRows || []).map((r) => [r.user_id, r]));

  const { data: suppressions } = await supabase
    .from(SUPPRESSIONS_TABLE)
    .select("normalized_email, reason, active")
    .eq("active", true);

  const hardSuppressedEmails = new Set();
  for (const row of suppressions || []) {
    if (isHardSuppressionReason(row.reason)) {
      hardSuppressedEmails.add(String(row.normalized_email || "").toLowerCase());
    }
  }

  return countEligibleFromSnapshot(profiles, prefsByUser, hardSuppressedEmails);
}

/**
 * Aggregate marketing audience counts for admin UI (no individual emails).
 * Uses set-based DB reads + in-memory policy evaluation (no per-user queries).
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

  const { eligible, exclusionBreakdown } = countEligibleFromSnapshot(
    rows,
    prefsByUser,
    hardSuppressedEmails
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

export { countEligibleFromSnapshot, evaluateMarketingEligibleInMemory };
