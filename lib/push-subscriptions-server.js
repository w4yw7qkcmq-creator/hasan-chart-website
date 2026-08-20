import { getSupabaseAdmin } from "./auth-session";

const SUBSCRIPTION_COLUMNS =
  "id, endpoint, email, user_id, anonymous_id, created_at, updated_at";

export async function savePushSubscriptionRow({
  endpoint,
  p256dh,
  auth,
  userId,
  email,
  anonymousId = null,
} = {}) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const row = {
    endpoint,
    p256dh,
    auth,
    user_id: userId,
    email,
    updated_at: now,
  };

  if (anonymousId) {
    row.anonymous_id = anonymousId;
  }

  const { data: existingByEndpoint, error: existingError } = await supabase
    .from("push_subscriptions")
    .select("id, email, user_id, anonymous_id, endpoint")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (existingError) {
    return { error: existingError, phase: "lookup" };
  }

  const savePhase = existingByEndpoint?.id ? "update" : "insert";

  if (existingByEndpoint?.id) {
    const updateResult = await supabase
      .from("push_subscriptions")
      .update(row)
      .eq("id", existingByEndpoint.id)
      .select(SUBSCRIPTION_COLUMNS)
      .single();

    return {
      phase: savePhase,
      data: updateResult.data,
      error: updateResult.error,
    };
  }

  const insertResult = await supabase
    .from("push_subscriptions")
    .insert({
      ...row,
      created_at: now,
    })
    .select(SUBSCRIPTION_COLUMNS)
    .single();

  return {
    phase: savePhase,
    data: insertResult.data,
    error: insertResult.error,
  };
}

export async function deleteOwnedPushSubscription({ userId, endpoint } = {}) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedEndpoint = String(endpoint || "").trim();

  if (!normalizedUserId || !normalizedEndpoint) {
    return { error: new Error("Missing push subscription ownership context") };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", normalizedEndpoint)
    .eq("user_id", normalizedUserId);

  return { error: error || null };
}

export async function backfillAnonymousPushSubscriptions({
  anonymousId,
  userId,
  email,
} = {}) {
  if (!anonymousId) return null;

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      email,
      user_id: userId,
      updated_at: now,
    })
    .eq("anonymous_id", anonymousId)
    .or("email.is.null,user_id.is.null");

  return error || null;
}
