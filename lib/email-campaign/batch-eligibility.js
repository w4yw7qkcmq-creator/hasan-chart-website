import { EMAIL_CATEGORIES } from "../email-categories.js";
import { isHardSuppressionReason } from "../email-suppression.js";
import { normalizeRecipientEmail } from "../email-recipient-eligibility.js";
import {
  evaluateMarketingEligibleInMemory,
} from "../email-policy/audience-metrics.js";

const PREFS_TABLE = "email_marketing_preferences";
const SUPPRESSIONS_TABLE = "email_suppressions";

/**
 * Load marketing prefs + hard suppressions in two parallel queries (fixed DB round trips).
 */
export async function loadMarketingEligibilityContext(supabase) {
  const [{ data: prefsRows, error: prefsError }, { data: suppressions, error: suppError }] =
    await Promise.all([
      supabase.from(PREFS_TABLE).select("user_id, marketing_opt_in, global_unsubscribed_at"),
      supabase
        .from(SUPPRESSIONS_TABLE)
        .select("normalized_email, reason, active")
        .eq("active", true),
    ]);

  if (prefsError) {
    throw new Error(prefsError.message || "Failed to load marketing preferences");
  }
  if (suppError) {
    throw new Error(suppError.message || "Failed to load suppressions");
  }

  const prefsByUser = new Map((prefsRows || []).map((row) => [row.user_id, row]));
  const hardSuppressedEmails = new Set();

  for (const row of suppressions || []) {
    if (isHardSuppressionReason(row.reason)) {
      hardSuppressedEmails.add(String(row.normalized_email || "").toLowerCase());
    }
  }

  return { prefsByUser, hardSuppressedEmails };
}

export function evaluateMarketingProfileEligibility(profile, context) {
  return evaluateMarketingEligibleInMemory(profile, context.prefsByUser, context.hardSuppressedEmails);
}

export function marketingEvaluationToRecipientResult(evaluation) {
  if (evaluation.allowed) {
    return { eligible: true, reason: null };
  }
  return { eligible: false, reason: evaluation.reason || "unknown" };
}

export async function evaluateProfilesForCampaignBatch(
  supabase,
  profiles,
  { category = EMAIL_CATEGORIES.MARKETING, context = null } = {}
) {
  if (String(category || "").toLowerCase() !== EMAIL_CATEGORIES.MARKETING) {
    throw new Error("Batch eligibility is supported for marketing campaigns only");
  }

  const eligibilityContext = context || (await loadMarketingEligibilityContext(supabase));
  const results = [];

  for (const profile of profiles) {
    const evaluation = evaluateMarketingProfileEligibility(profile, eligibilityContext);
    results.push({
      profile,
      ...marketingEvaluationToRecipientResult(evaluation),
    });
  }

  return { results, context: eligibilityContext };
}

export function evaluateRecipientRowEligibility(recipient, context) {
  const evaluation = evaluateMarketingProfileEligibility(
    { id: recipient.user_id, email: recipient.normalized_email || recipient.email },
    context
  );
  return marketingEvaluationToRecipientResult(evaluation);
}
