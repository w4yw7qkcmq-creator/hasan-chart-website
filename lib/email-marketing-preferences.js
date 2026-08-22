import { EMAIL_CONSENT_POLICY_VERSION, EMAIL_POLICY_SOURCES } from "./email-policy/constants.js";
import { getActiveSuppression, isHardSuppressionReason } from "./email-suppression.js";

const EMAIL_MARKETING_PREFERENCES_TABLE = "email_marketing_preferences";

export function normalizeMarketingEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function getMarketingPreferencesByUserId(supabase, userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return {
      marketing_opt_in: false,
      global_unsubscribed_at: null,
      source: null,
      opted_in_at: null,
      opted_out_at: null,
      policy_version: null,
    };
  }

  const { data, error } = await supabase
    .from(EMAIL_MARKETING_PREFERENCES_TABLE)
    .select(
      "marketing_opt_in, global_unsubscribed_at, source, updated_at, opted_in_at, opted_out_at, policy_version, normalized_email, metadata"
    )
    .eq("user_id", normalizedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load marketing preferences");
  }

  return (
    data || {
      marketing_opt_in: false,
      global_unsubscribed_at: null,
      source: null,
      opted_in_at: null,
      opted_out_at: null,
      policy_version: null,
    }
  );
}

export async function resolveUserIdByEmail(supabase, email) {
  const normalizedEmail = normalizeMarketingEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to resolve user by email");
  }

  return data?.id || null;
}

export async function resolveProfileEmail(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to resolve profile email");
  }

  return normalizeMarketingEmail(data?.email || "");
}

export async function isMarketingEmailAllowed(supabase, { userId = null, email = null } = {}) {
  let resolvedUserId = userId || null;
  let normalizedEmail = normalizeMarketingEmail(email);

  if (!resolvedUserId && normalizedEmail) {
    resolvedUserId = await resolveUserIdByEmail(supabase, normalizedEmail);
  }

  if (!resolvedUserId) {
    return { allowed: false, reason: "unknown-user" };
  }

  const prefs = await getMarketingPreferencesByUserId(supabase, resolvedUserId);

  if (prefs.global_unsubscribed_at) {
    return { allowed: false, reason: "global-unsubscribed", userId: resolvedUserId };
  }

  if (!prefs.marketing_opt_in) {
    return { allowed: false, reason: "marketing-not-opted-in", userId: resolvedUserId };
  }

  if (!normalizedEmail) {
    normalizedEmail = await resolveProfileEmail(supabase, resolvedUserId);
  }

  if (normalizedEmail) {
    const suppression = await getActiveSuppression(supabase, normalizedEmail);
    if (suppression?.reason && isHardSuppressionReason(suppression.reason)) {
      return {
        allowed: false,
        reason: "hard-suppressed",
        suppressionReason: suppression.reason,
        userId: resolvedUserId,
      };
    }
  }

  return { allowed: true, reason: null, userId: resolvedUserId };
}

export async function upsertMarketingPreferences(
  supabase,
  {
    userId,
    marketingOptIn,
    source = EMAIL_POLICY_SOURCES.ADMIN,
    normalizedEmail = null,
    metadata = {},
    campaignId = null,
  } = {}
) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("userId is required");
  }

  const optIn = marketingOptIn === true;
  const now = new Date().toISOString();
  const existing = await getMarketingPreferencesByUserId(supabase, normalizedUserId);

  let email = normalizeMarketingEmail(normalizedEmail);
  if (!email) {
    email = await resolveProfileEmail(supabase, normalizedUserId);
  }

  const safeMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};

  if (campaignId) {
    safeMetadata.campaignId = String(campaignId);
  }

  const row = {
    user_id: normalizedUserId,
    marketing_opt_in: optIn,
    normalized_email: email || null,
    source: String(source || EMAIL_POLICY_SOURCES.ADMIN).trim(),
    policy_version: EMAIL_CONSENT_POLICY_VERSION,
    metadata: safeMetadata,
    updated_at: now,
  };

  if (optIn) {
    row.opted_in_at = now;
    row.opted_out_at = null;
    row.global_unsubscribed_at = null;
  } else {
    row.opted_out_at = now;
    row.global_unsubscribed_at = now;
    row.opted_in_at = existing.opted_in_at || null;
  }

  const { data, error } = await supabase
    .from(EMAIL_MARKETING_PREFERENCES_TABLE)
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to upsert marketing preferences");
  }

  return data;
}

export function serializeMarketingPreferencesForUser(row) {
  const prefs = row || {};
  return {
    marketingOptIn: prefs.marketing_opt_in === true,
    globalUnsubscribedAt: prefs.global_unsubscribed_at || null,
    optedInAt: prefs.opted_in_at || null,
    optedOutAt: prefs.opted_out_at || null,
    source: prefs.source || null,
    policyVersion: prefs.policy_version || null,
    updatedAt: prefs.updated_at || null,
  };
}
