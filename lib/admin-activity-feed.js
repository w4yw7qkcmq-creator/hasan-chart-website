import { isMissingDatabaseResourceError } from "./admin-user-management-shared.js";

export const ADMIN_ACTIVITY_FEED_LIMIT = 20;
export const ADMIN_ACTIVITY_FEED_SOURCE_LIMIT = 8;

const OPTIONAL_SOURCES = new Set([
  "admin_logs",
  "price_alerts",
  "vip_signals",
]);

const LIFECYCLE_ACTIONS = new Set([
  "suspend_user",
  "unsuspend_user",
  "ban_user",
  "unban_user",
  "soft_delete_user",
  "restore_user",
  "force_logout",
  "password_reset_requested",
  "activate_service",
  "deactivate_service",
  "extend_subscription",
]);

const ACTION_LABELS = {
  suspend_user: "تم تعليق حساب مستخدم",
  unsuspend_user: "تم رفع تعليق حساب",
  ban_user: "تم حظر حساب مستخدم",
  unban_user: "تم إلغاء حظر حساب",
  soft_delete_user: "تم حذف حساب منطقيًا",
  restore_user: "تمت استعادة حساب",
  force_logout: "تم تسجيل خروج شامل",
  password_reset_requested: "تم طلب إعادة تعيين كلمة المرور",
  activate_service: "تم تفعيل خدمة",
  deactivate_service: "تم إيقاف خدمة",
  extend_subscription: "تم تمديد اشتراك",
};

const EVENT_ICONS = {
  user_registered: "👤",
  analysis_request: "🧠",
  subscription_request: "💳",
  subscription_activated: "⭐",
  account_request: "📂",
  price_alert: "🔔",
  vip_signal: "📣",
  admin_action: "🛡️",
};

function isVipPlanName(planName = "") {
  const text = String(planName || "").toLowerCase();
  return /vip|spot|future|فيوتشر|سبوت/.test(text);
}

function isActivatedSubscriptionStatus(status = "") {
  const raw = String(status || "").trim();
  const lower = raw.toLowerCase();
  return ["مفعل", "نشط", "active", "approved"].includes(raw) || lower === "active";
}

export function maskActivityActorLabel({ email = "", username = "" } = {}) {
  const name = String(username || "").trim();
  if (name) {
    if (name.length <= 2) return name;
    return `${name.slice(0, 2)}***`;
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    return normalizedEmail ? `${normalizedEmail.slice(0, 2)}***` : "مستخدم";
  }

  const [local, domain] = normalizedEmail.split("@");
  const maskedLocal = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

export function mergeActivityFeedEvents(events, limit = ADMIN_ACTIVITY_FEED_LIMIT) {
  const seen = new Set();
  const merged = [];

  for (const event of events || []) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }

  merged.sort(
    (left, right) =>
      new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime()
  );

  return merged.slice(0, limit);
}

function buildFeedEvent({
  id,
  type,
  title,
  actorLabel = "",
  occurredAt,
  tab = "",
  href = "",
  targetUserId = "",
  targetId = "",
  meta = "",
}) {
  return {
    id,
    type,
    icon: EVENT_ICONS[type] || "📌",
    title,
    actorLabel,
    occurredAt,
    tab,
    href,
    targetUserId,
    targetId,
    meta,
  };
}

function normalizeSourceError(error, queryName) {
  const message = String(error?.message || error || "").trim();
  const optional = OPTIONAL_SOURCES.has(queryName);
  const missing = isMissingDatabaseResourceError(error);

  if (missing || optional) {
    console.warn("[activity-feed] skipped optional source", {
      queryName,
      optional,
      missing,
    });
    return { skipped: true, message: optional || missing ? "optional_skip" : message };
  }

  console.warn("[activity-feed] source failed", { queryName, message });
  return { skipped: false, message };
}

async function fetchSource(queryName, runner) {
  try {
    const rows = await runner();
    return { ok: true, rows: rows || [], error: null, queryName, skipped: false };
  } catch (error) {
    const normalized = normalizeSourceError(error, queryName);
    return {
      ok: false,
      rows: [],
      error: normalized.message,
      queryName,
      skipped: normalized.skipped,
    };
  }
}

function mapProfileEvents(rows) {
  return (rows || []).map((row) =>
    buildFeedEvent({
      id: `profile:${row.id}`,
      type: "user_registered",
      title: "تم تسجيل مستخدم جديد",
      actorLabel: maskActivityActorLabel({ email: row.email, username: row.username }),
      occurredAt: row.created_at,
      tab: "user-management",
      targetUserId: row.id,
      targetId: row.id,
    })
  );
}

function mapAnalysisEvents(rows) {
  return (rows || []).map((row) =>
    buildFeedEvent({
      id: `analysis:${row.id}`,
      type: "analysis_request",
      title: "تم إنشاء طلب تحليل",
      actorLabel: maskActivityActorLabel({ email: row.user_email, username: row.username }),
      occurredAt: row.created_at,
      tab: "analysis",
      targetId: row.id,
      meta: row.coin ? String(row.coin) : "",
    })
  );
}

function mapSubscriptionEvents(rows) {
  return (rows || []).map((row) => {
    const activated = isActivatedSubscriptionStatus(row.status);
    const vip = isVipPlanName(row.plan_name);
    return buildFeedEvent({
      id: `subscription:${row.id}:${activated ? "activated" : "created"}`,
      type: activated ? "subscription_activated" : "subscription_request",
      title: activated
        ? vip
          ? "تم تفعيل اشتراك VIP"
          : "تم تفعيل اشتراك"
        : "تم إنشاء طلب اشتراك",
      actorLabel: maskActivityActorLabel({ email: row.user_email, username: row.username }),
      occurredAt: row.created_at,
      tab: "subscriptions",
      targetId: row.id,
      meta: row.plan_name ? String(row.plan_name) : "",
    });
  });
}

function mapAccountEvents(rows) {
  return (rows || []).map((row) =>
    buildFeedEvent({
      id: `account:${row.id}`,
      type: "account_request",
      title: "تم إنشاء طلب إدارة حساب",
      actorLabel: maskActivityActorLabel({ email: row.email }),
      occurredAt: row.created_at,
      tab: "accounts",
      targetUserId: row.user_id || "",
      targetId: row.id,
      meta: row.platform ? String(row.platform) : "",
    })
  );
}

function mapPriceAlertEvents(rows) {
  return (rows || []).map((row) =>
    buildFeedEvent({
      id: `price_alert:${row.id}`,
      type: "price_alert",
      title: "تم إنشاء تنبيه سعر",
      actorLabel: maskActivityActorLabel({ email: row.user_email }),
      occurredAt: row.created_at,
      tab: "user-management",
      targetId: row.id,
      meta: row.coin ? String(row.coin) : "",
    })
  );
}

function mapVipSignalEvents(rows) {
  return (rows || []).map((row) =>
    buildFeedEvent({
      id: `vip_signal:${row.id}`,
      type: "vip_signal",
      title: "تم إرسال توصية VIP",
      actorLabel: "الإدارة",
      occurredAt: row.created_at,
      tab: "vip",
      targetId: row.id,
      meta: row.coin ? String(row.coin) : "",
    })
  );
}

function mapAdminLogEvents(rows) {
  return (rows || [])
    .map((row) => {
      const action = String(row.action || "").trim();
      if (!LIFECYCLE_ACTIONS.has(action)) return null;

      const details = row.details || {};
      const serviceSuffix = details.service ? ` (${details.service})` : "";
      const daysSuffix =
        action === "extend_subscription" && details.days ? ` ${details.days} يومًا` : "";

      let title = ACTION_LABELS[action] || "إجراء إداري";
      if (action === "extend_subscription") {
        title = `تم تمديد اشتراك${daysSuffix}`.trim();
      } else if (action === "activate_service") {
        title = `تم تفعيل خدمة${serviceSuffix}`.trim();
      } else if (action === "publish-vip-signal" && details.coin) {
        title = `تم إرسال توصية VIP (${details.coin})`;
      }

      const targetUserId =
        details.target_user_id || (row.target_table === "profiles" ? row.target_id : "") || row.target_id || "";

      return buildFeedEvent({
        id: `admin_log:${row.id}`,
        type: "admin_action",
        title,
        actorLabel: details.target_email
          ? maskActivityActorLabel({ email: details.target_email })
          : targetUserId
          ? "مستخدم"
          : "الإدارة",
        occurredAt: row.created_at,
        tab: targetUserId ? "user-management" : action === "publish-vip-signal" ? "vip" : "",
        targetUserId,
        targetId: row.target_id || "",
      });
    })
    .filter(Boolean);
}

export async function loadAdminActivityFeed(supabase, { limit = ADMIN_ACTIVITY_FEED_LIMIT } = {}) {
  const sourceLimit = ADMIN_ACTIVITY_FEED_SOURCE_LIMIT;
  const startedAt = Date.now();

  const sourceDefinitions = [
    {
      key: "admin_logs",
      queryName: "admin_logs",
      run: async () => {
        const response = await supabase
          .from("admin_logs")
          .select("id,action,target_table,target_id,details,created_at")
          .in("action", [...LIFECYCLE_ACTIONS])
          .order("created_at", { ascending: false })
          .limit(sourceLimit);
        if (response.error) throw response.error;
        return response.data;
      },
      map: mapAdminLogEvents,
    },
    {
      key: "profiles",
      queryName: "profiles",
      run: async () => {
        const response = await supabase
          .from("profiles")
          .select("id,email,username,created_at")
          .order("created_at", { ascending: false })
          .limit(sourceLimit);
        if (response.error) throw response.error;
        return response.data;
      },
      map: mapProfileEvents,
    },
    {
      key: "analysis_requests",
      queryName: "analysis_requests",
      run: async () => {
        const response = await supabase
          .from("analysis_requests")
          .select("id,user_email,username,coin,status,created_at")
          .order("created_at", { ascending: false })
          .limit(sourceLimit);
        if (response.error) throw response.error;
        return response.data;
      },
      map: mapAnalysisEvents,
    },
    {
      key: "subscription_requests",
      queryName: "subscription_requests",
      run: async () => {
        const response = await supabase
          .from("subscription_requests")
          .select("id,user_email,username,plan_name,status,created_at")
          .order("created_at", { ascending: false })
          .limit(sourceLimit);
        if (response.error) throw response.error;
        return response.data;
      },
      map: mapSubscriptionEvents,
    },
    {
      key: "account_management_requests",
      queryName: "account_management_requests",
      run: async () => {
        const response = await supabase
          .from("account_management_requests")
          .select("id,user_id,email,platform,status,created_at")
          .order("created_at", { ascending: false })
          .limit(sourceLimit);
        if (response.error) throw response.error;
        return response.data;
      },
      map: mapAccountEvents,
    },
    {
      key: "price_alerts",
      queryName: "price_alerts",
      run: async () => {
        const response = await supabase
          .from("price_alerts")
          .select("id,user_email,coin,status,created_at")
          .order("created_at", { ascending: false })
          .limit(sourceLimit);
        if (response.error) throw response.error;
        return response.data;
      },
      map: mapPriceAlertEvents,
    },
    {
      key: "vip_signals",
      queryName: "vip_signals",
      run: async () => {
        const response = await supabase
          .from("vip_signals")
          .select("id,coin,signal_type,created_at")
          .order("created_at", { ascending: false })
          .limit(sourceLimit);
        if (response.error) throw response.error;
        return response.data;
      },
      map: mapVipSignalEvents,
    },
  ];

  const settled = await Promise.allSettled(
    sourceDefinitions.map((source) => fetchSource(source.queryName, source.run))
  );

  const sourceMeta = {};
  const eventBuckets = [];

  for (let index = 0; index < sourceDefinitions.length; index += 1) {
    const definition = sourceDefinitions[index];
    const result = settled[index];

    if (result.status === "rejected") {
      const normalized = normalizeSourceError(result.reason, definition.queryName);
      sourceMeta[definition.key] = {
        ok: false,
        count: 0,
        error: normalized.message,
        skipped: normalized.skipped,
      };
      continue;
    }

    const fetched = result.value;
    sourceMeta[definition.key] = {
      ok: fetched.ok,
      count: fetched.rows.length,
      error: fetched.error,
      skipped: fetched.skipped,
    };

    if (fetched.ok) {
      eventBuckets.push(...definition.map(fetched.rows));
    }
  }

  const merged = mergeActivityFeedEvents(eventBuckets, limit);
  const sourceResults = Object.values(sourceMeta);
  const successfulSources = sourceResults.filter((item) => item.ok);
  const hardFailures = sourceResults.filter((item) => !item.ok && !item.skipped);
  const partialFailure = sourceResults.some((item) => !item.ok);
  const allSourcesFailed = successfulSources.length === 0 && merged.length === 0;

  return {
    success: true,
    section: "activity-feed",
    events: merged,
    returnedRows: merged.length,
    sources: sourceMeta,
    partialFailure,
    allSourcesFailed,
    hardFailureCount: hardFailures.length,
    durationMs: Date.now() - startedAt,
  };
}
