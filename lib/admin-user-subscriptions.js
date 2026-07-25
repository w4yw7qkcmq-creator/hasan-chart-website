import { writeAdminAuditLog } from "./admin-audit-log.js";
import {
  ADMIN_EVENT_TYPES,
  buildAdminEventIdempotencyKey,
  dispatchAdminEvent,
} from "./admin-events.js";
import { reconcileProfileSubscriptionFromRequests } from "./admin-subscription-profile-reconcile.js";
import { onPartnerSubscriptionActivated } from "./partner-service-hooks.js";

export const SUBSCRIPTION_LIST_COLUMNS =
  "id,user_email,username,plan_name,category,price,status,started_at,expires_at,created_at,admin_disabled,admin_disabled_at,admin_disabled_reason,activation_source";

const ACTIVE_STATUSES = new Set(["مفعل", "نشط", "active"]);

export function getSubscriptionDurationDays(planName) {
  const text = String(planName || "").toLowerCase();

  if (text.includes("year") || text.includes("سنة") || text.includes("سنو")) return 365;
  if (text.includes("6 month") || text.includes("6 months") || text.includes("6 أشهر") || text.includes("ستة")) {
    return 180;
  }
  if (text.includes("3 month") || text.includes("3 months") || text.includes("3 أشهر") || text.includes("ثلاث")) {
    return 90;
  }
  if (text.includes("week") || text.includes("أسبوع") || text.includes("اسبوع")) return 7;
  return 30;
}

export function addDays(baseDate, days) {
  const date = new Date(baseDate || Date.now());
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

export function inferActivationSource(row) {
  if (row?.activation_source) return row.activation_source;
  if (row?.payment_proof) return "payment";
  if (row?.status === "مفعل" && row?.started_at) return "admin";
  return "unknown";
}

export function mapSubscriptionRow(row) {
  const statusRaw = String(row?.status || "").trim();
  const adminDisabled = Boolean(row?.admin_disabled);
  const expired =
    row?.expires_at && new Date(row.expires_at).getTime() <= Date.now() && ACTIVE_STATUSES.has(statusRaw);

  let displayStatus = "ملغى";
  if (statusRaw === "منتهي" || expired) {
    displayStatus = adminDisabled ? "منتهي (إدارة)" : "منتهي";
  } else if (adminDisabled || statusRaw === "موقوف") {
    displayStatus = "موقوف";
  } else if (ACTIVE_STATUSES.has(statusRaw)) {
    displayStatus = "نشط";
  } else if (["مرفوض", "ملغى", "مؤرشف"].includes(statusRaw)) {
    displayStatus = "ملغى";
  } else if (statusRaw) {
    displayStatus = statusRaw;
  }

  return {
    id: row.id,
    serviceName: row.plan_name || row.category || "اشتراك",
    planName: row.plan_name || "—",
    category: row.category || "—",
    status: displayStatus,
    rawStatus: statusRaw,
    startedAt: row.started_at || row.created_at || null,
    endsAt: row.expires_at || null,
    autoRenew: false,
    activationSource: inferActivationSource(row),
    adminDisabled,
    price: row.price || null,
    createdAt: row.created_at || null,
  };
}

export async function reconcileProfileSubscription(supabase, userEmail) {
  return reconcileProfileSubscriptionFromRequests(supabase, userEmail);
}

async function fetchSubscriptionById(supabase, subscriptionId, userEmail) {
  const { data, error } = await supabase
    .from("subscription_requests")
    .select(SUBSCRIPTION_LIST_COLUMNS)
    .eq("id", subscriptionId)
    .eq("user_email", userEmail)
    .maybeSingle();

  if (error && /column .* does not exist/i.test(error.message || "")) {
    const fallback = await supabase
      .from("subscription_requests")
      .select("id,user_email,username,plan_name,category,price,status,started_at,expires_at,created_at")
      .eq("id", subscriptionId)
      .eq("user_email", userEmail)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data;
  }

  if (error) throw error;
  return data;
}

export async function activateSubscription(
  supabase,
  { subscriptionId, userEmail, adminUser, source = "admin", skipAudit = false }
) {
  const before = await fetchSubscriptionById(supabase, subscriptionId, userEmail);
  if (!before) {
    const error = new Error("الاشتراك غير موجود");
    error.status = 404;
    throw error;
  }

  const startedAt = new Date().toISOString();
  const expiresAt = addDays(startedAt, getSubscriptionDurationDays(before.plan_name));

  const patch = {
    status: "مفعل",
    started_at: startedAt,
    expires_at: expiresAt,
    expired_notice_sent: false,
    admin_disabled: false,
    activation_source: source,
  };

  const { data: after, error } = await supabase
    .from("subscription_requests")
    .update(patch)
    .eq("id", subscriptionId)
    .select(SUBSCRIPTION_LIST_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  await reconcileProfileSubscription(supabase, userEmail);

  try {
    await onPartnerSubscriptionActivated(supabase, { subscriptionRequestId: subscriptionId });
  } catch (partnerError) {
    console.warn("Partner hook skipped:", partnerError?.message || partnerError);
  }

  if (!skipAudit) {
    await writeAdminAuditLog(supabase, {
      adminUserId: adminUser?.id,
      adminEmail: adminUser?.email,
      targetUserId: null,
      action: "activate_subscription",
      entityType: "subscription_requests",
      entityId: subscriptionId,
      beforeData: before,
      afterData: after,
    });
  }

  return after;
}

export async function suspendSubscription(
  supabase,
  { subscriptionId, userEmail, adminUser, reason = "", skipAudit = false }
) {
  const before = await fetchSubscriptionById(supabase, subscriptionId, userEmail);
  if (!before) {
    const error = new Error("الاشتراك غير موجود");
    error.status = 404;
    throw error;
  }

  const patch = {
    admin_disabled: true,
    admin_disabled_at: new Date().toISOString(),
    admin_disabled_by: adminUser?.id || null,
    admin_disabled_reason: reason || null,
    status: "موقوف",
  };

  const { data: after, error } = await supabase
    .from("subscription_requests")
    .update(patch)
    .eq("id", subscriptionId)
    .select(SUBSCRIPTION_LIST_COLUMNS)
    .maybeSingle();

  if (error && /column .* does not exist/i.test(error.message || "")) {
    const fallbackPatch = { status: "موقوف" };
    const fallback = await supabase
      .from("subscription_requests")
      .update(fallbackPatch)
      .eq("id", subscriptionId)
      .select("id,user_email,plan_name,category,status,started_at,expires_at,created_at")
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    await reconcileProfileSubscription(supabase, userEmail);
    if (!skipAudit) {
      await writeAdminAuditLog(supabase, {
        adminUserId: adminUser?.id,
        adminEmail: adminUser?.email,
        action: "deactivate_subscription",
        entityType: "subscription_requests",
        entityId: subscriptionId,
        beforeData: before,
        afterData: fallback.data,
      });
    }
    return fallback.data;
  }

  if (error) throw error;

  await reconcileProfileSubscription(supabase, userEmail);

  if (!skipAudit) {
    await writeAdminAuditLog(supabase, {
      adminUserId: adminUser?.id,
      adminEmail: adminUser?.email,
      action: "deactivate_subscription",
      entityType: "subscription_requests",
      entityId: subscriptionId,
      beforeData: before,
      afterData: after,
    });
  }

  return after;
}

export async function reactivateSubscription(supabase, ctx) {
  return activateSubscription(supabase, { ...ctx, source: "admin" });
}

export async function cancelSubscription(supabase, { subscriptionId, userEmail, adminUser }) {
  const before = await fetchSubscriptionById(supabase, subscriptionId, userEmail);
  if (!before) {
    const error = new Error("الاشتراك غير موجود");
    error.status = 404;
    throw error;
  }

  const { data: after, error } = await supabase
    .from("subscription_requests")
    .update({ status: "ملغى", admin_disabled: true })
    .eq("id", subscriptionId)
    .select(SUBSCRIPTION_LIST_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  await reconcileProfileSubscription(supabase, userEmail);

  await writeAdminAuditLog(supabase, {
    adminUserId: adminUser?.id,
    adminEmail: adminUser?.email,
    action: "cancel_subscription",
    entityType: "subscription_requests",
    entityId: subscriptionId,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function extendSubscription(
  supabase,
  {
    subscriptionId,
    userEmail,
    adminUser,
    days,
    expiresAt = null,
    skipAudit = false,
    targetUserId = null,
    dispatchAdminEventFn = dispatchAdminEvent,
    adminEventDeps = null,
  }
) {
  const before = await fetchSubscriptionById(supabase, subscriptionId, userEmail);
  if (!before) {
    const error = new Error("الاشتراك غير موجود");
    error.status = 404;
    throw error;
  }

  const base = before.expires_at && new Date(before.expires_at).getTime() > Date.now()
    ? before.expires_at
    : new Date().toISOString();

  const nextExpiresAt = expiresAt || addDays(base, days);

  if (new Date(nextExpiresAt).getTime() <= Date.now()) {
    const error = new Error("تاريخ الانتهاء يجب أن يكون في المستقبل");
    error.status = 400;
    throw error;
  }

  const patch = {
    status: "مفعل",
    expires_at: nextExpiresAt,
    expired_notice_sent: false,
    admin_disabled: false,
    started_at: before.started_at || before.created_at || new Date().toISOString(),
  };

  const { data: after, error } = await supabase
    .from("subscription_requests")
    .update(patch)
    .eq("id", subscriptionId)
    .select(SUBSCRIPTION_LIST_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  await reconcileProfileSubscription(supabase, userEmail);

  if (!skipAudit) {
    try {
      await dispatchAdminEventFn(
        {
          eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
          actor: { id: adminUser?.id, email: adminUser?.email },
          target: {
            type: "subscription_requests",
            id: subscriptionId,
            userEmail,
            userId: targetUserId || null,
          },
          context: {
            planName: after?.plan_name || before?.plan_name || null,
            previousExpiresAt: before?.expires_at || null,
            expiresAt: nextExpiresAt,
            days: days || null,
            targetUserId: targetUserId || null,
            beforeSnapshot: before,
            afterSnapshot: after,
            extendedAt: new Date().toISOString(),
          },
          notification: { enabled: false },
          email: { enabled: false },
          audit: {
            enabled: true,
            action: "extend_subscription",
            targetTable: "subscription_requests",
          },
          idempotencyKey: buildAdminEventIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
            subscriptionId
          ),
        },
        { supabase, ...(adminEventDeps || {}) }
      );
    } catch (dispatchError) {
      console.error(
        "SUBSCRIPTION_EXTEND_ADMIN_EVENT_FAILED",
        dispatchError?.message || dispatchError
      );
    }
  }

  return after;
}

export async function changeSubscriptionPlan(
  supabase,
  { subscriptionId, userEmail, adminUser, planName, category = null }
) {
  const before = await fetchSubscriptionById(supabase, subscriptionId, userEmail);
  if (!before) {
    const error = new Error("الاشتراك غير موجود");
    error.status = 404;
    throw error;
  }

  const patch = {
    plan_name: String(planName || "").trim() || before.plan_name,
  };
  if (category) patch.category = String(category).trim();

  const { data: after, error } = await supabase
    .from("subscription_requests")
    .update(patch)
    .eq("id", subscriptionId)
    .select(SUBSCRIPTION_LIST_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  await reconcileProfileSubscription(supabase, userEmail);

  await writeAdminAuditLog(supabase, {
    adminUserId: adminUser?.id,
    adminEmail: adminUser?.email,
    action: "change_plan",
    entityType: "subscription_requests",
    entityId: subscriptionId,
    beforeData: before,
    afterData: after,
  });

  return after;
}
