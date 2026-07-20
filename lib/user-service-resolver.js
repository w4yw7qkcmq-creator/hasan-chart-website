const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["مفعل", "نشط", "active"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "مرفوض",
  "ملغى",
  "مؤرشف",
  "منتهي",
  "موقوف",
  "rejected",
  "cancelled",
  "expired",
]);

const ACTIVE_ACCOUNT_MANAGEMENT_STATUSES = new Set(["نشط", "مفعل", "active", "تمت المراجعة", "approved"]);
const ACTIVE_ALERT_STATUSES = new Set(["active", "نشط", "enabled"]);

function emptyService(manageable = false) {
  return {
    active: false,
    source: null,
    startedAt: null,
    expiresAt: null,
    recordId: null,
    manageable,
  };
}

function isSubscriptionActive(row) {
  if (!row) return false;
  if (row.admin_disabled) return false;

  const status = String(row.status || "").trim();
  const normalized = status.toLowerCase();

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(status) || INACTIVE_SUBSCRIPTION_STATUSES.has(normalized)) {
    return false;
  }

  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status) && !ACTIVE_SUBSCRIPTION_STATUSES.has(normalized)) {
    return false;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }

  return true;
}

function matchesServiceKey(row, serviceKey) {
  const combined = `${row?.plan_name || ""} ${row?.category || ""}`.toLowerCase();

  if (serviceKey === "vip") {
    return (
      combined.includes("vip") ||
      combined.includes("spot") ||
      combined.includes("future") ||
      combined.includes("فيوتشر")
    );
  }

  if (serviceKey === "academy") {
    return combined.includes("academy") || combined.includes("أكاديم") || combined.includes("academ");
  }

  return false;
}

function pickBestSubscriptionRow(rows, serviceKey) {
  const candidates = (rows || []).filter((row) => matchesServiceKey(row, serviceKey));
  if (!candidates.length) return null;

  const active = candidates.find(isSubscriptionActive);
  if (active) return active;

  return candidates.sort(
    (left, right) =>
      new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  )[0];
}

function mapSubscriptionService(row) {
  if (!row) return emptyService(true);

  return {
    active: isSubscriptionActive(row),
    source: row.activation_source || (row.payment_proof ? "payment" : "request"),
    startedAt: row.started_at || row.created_at || null,
    expiresAt: row.expires_at || null,
    recordId: row.id,
    manageable: true,
  };
}

function resolveAccountManagementService(rows) {
  const latest = (rows || []).sort(
    (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  )[0];

  if (!latest) return emptyService(true);

  const status = String(latest.status || "").trim();
  const normalized = status.toLowerCase();
  const active =
    ACTIVE_ACCOUNT_MANAGEMENT_STATUSES.has(status) || ACTIVE_ACCOUNT_MANAGEMENT_STATUSES.has(normalized);

  return {
    active,
    source: "account_management_requests",
    startedAt: latest.created_at || null,
    expiresAt: null,
    recordId: latest.id,
    manageable: true,
  };
}

function resolvePriceAlertsService(rows) {
  const activeRows = (rows || []).filter((row) => {
    const status = String(row.status || "").trim().toLowerCase();
    return ACTIVE_ALERT_STATUSES.has(status);
  });

  const latest = (rows || []).sort(
    (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  )[0];

  return {
    active: activeRows.length > 0,
    source: "price_alerts",
    startedAt: latest?.created_at || null,
    expiresAt: null,
    recordId: latest?.id || null,
    manageable: true,
    activeCount: activeRows.length,
  };
}

export async function resolveUserServices(supabase, userId) {
  const normalizedUserId = String(userId || "").trim();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,subscription_plan,subscription_status")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    const error = new Error("المستخدم غير موجود");
    error.status = 404;
    throw error;
  }

  const email = String(profile.email || "").trim().toLowerCase();

  const [subscriptionsResult, accountManagementResult, alertsResult] = await Promise.all([
    email
      ? supabase
          .from("subscription_requests")
          .select(
            "id,plan_name,category,status,started_at,expires_at,created_at,admin_disabled,activation_source,payment_proof"
          )
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("account_management_requests")
      .select("id,status,created_at")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .limit(10),
    email
      ? supabase
          .from("price_alerts")
          .select("id,status,created_at")
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (accountManagementResult.error) throw accountManagementResult.error;
  if (alertsResult.error) throw alertsResult.error;

  const subscriptions = subscriptionsResult.data || [];

  return {
    userId: normalizedUserId,
    email,
    vip: mapSubscriptionService(pickBestSubscriptionRow(subscriptions, "vip")),
    academy: mapSubscriptionService(pickBestSubscriptionRow(subscriptions, "academy")),
    accountManagement: resolveAccountManagementService(accountManagementResult.data || []),
    priceAlerts: resolvePriceAlertsService(alertsResult.data || []),
  };
}

export { isSubscriptionActive, matchesServiceKey, pickBestSubscriptionRow };
