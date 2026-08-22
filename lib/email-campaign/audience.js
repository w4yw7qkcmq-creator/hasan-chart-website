import { CAMPAIGN_AUDIENCE_TYPES } from "./constants.js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "مفعل", "نشط"]);

export function normalizeAudienceFilter(audienceType, filter = {}) {
  const type = String(audienceType || CAMPAIGN_AUDIENCE_TYPES.ALL_ELIGIBLE).trim();
  const safe = filter && typeof filter === "object" && !Array.isArray(filter) ? filter : {};

  if (type === CAMPAIGN_AUDIENCE_TYPES.SELECTED_USERS) {
    const userIds = Array.isArray(safe.userIds)
      ? safe.userIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    return { userIds: [...new Set(userIds)] };
  }

  return {};
}

export function isActiveSubscriptionStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ACTIVE_SUBSCRIPTION_STATUSES.has(normalized) || ACTIVE_SUBSCRIPTION_STATUSES.has(String(status || "").trim());
}

export async function resolveAudienceProfiles(supabase, { audienceType, audienceFilter = {} } = {}) {
  const type = String(audienceType || CAMPAIGN_AUDIENCE_TYPES.ALL_ELIGIBLE).trim();
  const filter = normalizeAudienceFilter(type, audienceFilter);

  if (type === CAMPAIGN_AUDIENCE_TYPES.SELECTED_USERS) {
    if (!filter.userIds.length) {
      return [];
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, subscription_status, account_status, deleted_at")
      .in("id", filter.userIds);

    if (error) throw new Error(error.message || "Failed to load selected users");
    return (data || []).filter((row) => row.email && !row.deleted_at);
  }

  let query = supabase
    .from("profiles")
    .select("id, email, subscription_status, account_status, deleted_at")
    .not("email", "is", null)
    .is("deleted_at", null)
    .neq("account_status", "deleted")
    .neq("account_status", "banned");

  if (type === CAMPAIGN_AUDIENCE_TYPES.ACTIVE_SUBSCRIBERS) {
    query = query.in("subscription_status", ["active", "مفعل", "نشط"]);
  }

  const { data, error } = await query.limit(10000);

  if (error) {
    throw new Error(error.message || "Failed to resolve audience profiles");
  }

  let rows = (data || []).filter((row) => String(row.email || "").includes("@"));

  if (type === CAMPAIGN_AUDIENCE_TYPES.NON_SUBSCRIBERS) {
    rows = rows.filter((row) => !isActiveSubscriptionStatus(row.subscription_status));
  }

  return rows;
}

export async function searchAudienceUsers(supabase, { query, limit = 20 } = {}) {
  const q = String(query || "").trim();
  if (!q || q.length < 2) {
    return [];
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, username, subscription_status")
    .or(`email.ilike.%${q}%,username.ilike.%${q}%`)
    .is("deleted_at", null)
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message || "Failed to search users");
  }

  return data || [];
}
