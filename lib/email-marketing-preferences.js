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
    };
  }

  const { data, error } = await supabase
    .from(EMAIL_MARKETING_PREFERENCES_TABLE)
    .select("marketing_opt_in, global_unsubscribed_at, source, updated_at")
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

export async function isMarketingEmailAllowed(supabase, { userId = null, email = null } = {}) {
  let resolvedUserId = userId || null;

  if (!resolvedUserId && email) {
    resolvedUserId = await resolveUserIdByEmail(supabase, email);
  }

  if (!resolvedUserId) {
    return { allowed: false, reason: "unknown-user" };
  }

  const prefs = await getMarketingPreferencesByUserId(supabase, resolvedUserId);

  if (prefs.global_unsubscribed_at) {
    return { allowed: false, reason: "global-unsubscribed" };
  }

  if (!prefs.marketing_opt_in) {
    return { allowed: false, reason: "marketing-not-opted-in" };
  }

  return { allowed: true, reason: null, userId: resolvedUserId };
}

export async function upsertMarketingPreferences(
  supabase,
  { userId, marketingOptIn, source = "admin" } = {}
) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("userId is required");
  }

  const optIn = marketingOptIn === true;
  const now = new Date().toISOString();

  const row = {
    user_id: normalizedUserId,
    marketing_opt_in: optIn,
    global_unsubscribed_at: optIn ? null : now,
    source: String(source || "admin").trim(),
    updated_at: now,
  };

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
