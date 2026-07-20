import { writeAdminAuditLog } from "./admin-audit-log.js";
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
  if (adminDisabled || statusRaw === "موقوف") {
    displayStatus = "موقوف";
  } else if (statusRaw === "منتهي" || expired) {
    displayStatus = "منتهي";
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
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return;

  const { data: rows, error } = await supabase
    .from("subscription_requests")
    .select("plan_name,category,status,expires_at,admin_disabled")
    .eq("user_email", email)
    .in("status", ["مفعل", "نشط", "active"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (/column .* does not exist/i.test(error.message || "")) {
      return;
    }
    throw error;
  }

  const activeRows = (rows || []).filter((row) => {
    if (row?.admin_disabled) return false;
    if (row?.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
    return true;
  });

  const planText = activeRows
    .map((row) => [row.plan_name, row.category].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" | ");

  await supabase
    .from("profiles")
    .update({
      subscription_plan: planText || "بدون اشتراك",
      subscription_status: activeRows.length ? "نشط" : "غير نشط",
    })
    .eq("email", email);
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
  { subscriptionId, userEmail, adminUser, days, expiresAt = null, skipAudit = false }
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
    await writeAdminAuditLog(supabase, {
      adminUserId: adminUser?.id,
      adminEmail: adminUser?.email,
      action: "extend_subscription",
      entityType: "subscription_requests",
      entityId: subscriptionId,
      beforeData: before,
      afterData: after,
      metadata: { days: days || null, expiresAt: nextExpiresAt },
    });
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
