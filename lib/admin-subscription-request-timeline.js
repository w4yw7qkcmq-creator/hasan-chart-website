import { mapSubscriptionRejectionDetailsFromAuditLog } from "./admin-subscription-rejection-details.js";

const REJECTED_STATUS = "مرفوض";
const REVIEWED_STATUSES = new Set(["تمت المراجعة", "reviewed", "approved", "completed"]);
const REVIEW_STARTED_STATUSES = new Set([
  "قيد المراجعة",
  "قيد المعالجة",
  "قيد التحليل",
  "بانتظار المراجعة",
  "reviewing",
  "pending",
]);
const ACTIVATED_STATUSES = new Set(["مفعل", "نشط", "active"]);
const CANCELLED_STATUSES = new Set(["مؤرشف", "ملغى", "ملغي", "cancelled", "canceled"]);

export const SUBSCRIPTION_TIMELINE_EVENT_META = {
  created: { icon: "🟢", color: "green", title: "تم إنشاء الطلب" },
  payment_proof: { icon: "💳", color: "gold", title: "تم رفع إثبات الدفع" },
  review_started: { icon: "👀", color: "blue", title: "بدء المراجعة" },
  reviewed: { icon: "🟡", color: "blue", title: "تمت المراجعة" },
  rejected: { icon: "❌", color: "red", title: "تم رفض الطلب" },
  email_sent: { icon: "📧", color: "cyan", title: "تم إرسال إيميل الرفض" },
  notification: { icon: "🔔", color: "orange", title: "إنشاء إشعار للمستخدم" },
  activated: { icon: "🟣", color: "purple", title: "تفعيل الاشتراك" },
  payment_recorded: { icon: "💰", color: "gold", title: "تسجيل عملية الدفع" },
  cancelled: { icon: "⚫", color: "gray", title: "إلغاء الطلب" },
};

const SUBSCRIPTION_AUDIT_ACTIONS = new Set([
  "reject-subscription-request",
  "update-subscription-request",
  "record-subscription-payment",
  "subscription-payment-recorded",
]);

function normalizeStatus(value) {
  return String(value || "").trim();
}

function resolveAdminLabel(logRow) {
  return (
    String(logRow?.admin_email || logRow?.details?.adminEmail || "").trim() || null
  );
}

function formatTimelineDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-SY-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildTimelineEvent(type, { occurredAt, description = "", adminEmail = null, dedupeKey }) {
  const meta = SUBSCRIPTION_TIMELINE_EVENT_META[type];
  if (!meta) return null;

  return {
    id: dedupeKey || `${type}:${occurredAt || "unknown"}`,
    type,
    icon: meta.icon,
    color: meta.color,
    title: meta.title,
    description: String(description || "").trim(),
    occurredAt: occurredAt || null,
    occurredAtLabel: formatTimelineDate(occurredAt),
    adminEmail,
  };
}

function buildRejectedDescription(details, adminEmail) {
  const lines = [];
  const reason = String(details?.rejectionReason || "").trim();
  const notes = String(details?.adminNotes || details?.rejectionNotes || "").trim();

  if (reason) {
    lines.push(`السبب:\n${reason}`);
  }

  if (notes) {
    lines.push(`ملاحظات الإدارة:\n${notes}`);
  }

  if (Object.prototype.hasOwnProperty.call(details || {}, "notificationCreated")) {
    lines.push(
      `الإشعار الداخلي: ${details.notificationCreated ? "تم" : "تعذر"}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(details || {}, "emailQueued")) {
    lines.push(
      `إيميل الرفض: ${
        details.emailQueued ? "تم وضعه في قائمة الإرسال" : "تعذر"
      }`
    );
  }

  if (adminEmail) {
    lines.push(`بواسطة:\n${adminEmail}`);
  }

  return lines.join("\n\n");
}

function mapAuditLogToTimelineEvents(logRow, { hasDedicatedRejectLog = false } = {}) {
  if (!logRow) return [];

  const action = String(logRow.action || "").trim();
  const details =
    logRow.details && typeof logRow.details === "object" ? logRow.details : {};
  const occurredAt = details.timestamp || logRow.created_at || null;
  const adminEmail = resolveAdminLabel(logRow);
  const logId = String(logRow.id || logRow.created_at || action);

  if (action === "reject-subscription-request") {
    return [
      buildTimelineEvent("rejected", {
        occurredAt,
        description: buildRejectedDescription(details, adminEmail),
        adminEmail,
        dedupeKey: `reject:${logId}`,
      }),
    ].filter(Boolean);
  }

  if (action === "update-subscription-request") {
    const status = normalizeStatus(details.status);

    if (status === REJECTED_STATUS) {
      if (hasDedicatedRejectLog) return [];
      return [
        buildTimelineEvent("rejected", {
          occurredAt,
          description: buildRejectedDescription(details, adminEmail),
          adminEmail,
          dedupeKey: `reject-status:${logId}`,
        }),
      ].filter(Boolean);
    }

    if (REVIEW_STARTED_STATUSES.has(status)) {
      return [
        buildTimelineEvent("review_started", {
          occurredAt,
          description: `تم تحديث حالة الطلب إلى «${status}».`,
          adminEmail,
          dedupeKey: `review-started:${logId}`,
        }),
      ].filter(Boolean);
    }

    if (REVIEWED_STATUSES.has(status)) {
      return [
        buildTimelineEvent("reviewed", {
          occurredAt,
          description: "اكتملت مراجعة الطلب من قبل الإدارة.",
          adminEmail,
          dedupeKey: `reviewed:${logId}`,
        }),
      ].filter(Boolean);
    }

    if (ACTIVATED_STATUSES.has(status)) {
      const expiresAt = details.expiresAt || details.expires_at || null;
      const expiryLine = expiresAt
        ? `\nينتهي في: ${formatTimelineDate(expiresAt)}`
        : "";

      return [
        buildTimelineEvent("activated", {
          occurredAt,
          description: `تم تفعيل الاشتراك${details.planName ? ` (${details.planName})` : ""}.${expiryLine}`,
          adminEmail,
          dedupeKey: `activated:${logId}`,
        }),
      ].filter(Boolean);
    }

    if (CANCELLED_STATUSES.has(status)) {
      return [
        buildTimelineEvent("cancelled", {
          occurredAt,
          description: `تم تحديث حالة الطلب إلى «${status}».`,
          adminEmail,
          dedupeKey: `cancelled:${logId}`,
        }),
      ].filter(Boolean);
    }
  }

  if (
    action === "record-subscription-payment" ||
    action === "subscription-payment-recorded"
  ) {
    return [
      buildTimelineEvent("payment_recorded", {
        occurredAt,
        description: "تم تسجيل عملية الدفع المرتبطة بالطلب.",
        adminEmail,
        dedupeKey: `payment:${logId}`,
      }),
    ].filter(Boolean);
  }

  return [];
}

function buildSyntheticTimelineEvents(requestRow = {}) {
  const events = [];
  const createdAt = requestRow.created_at || null;

  if (createdAt) {
    events.push(
      buildTimelineEvent("created", {
        occurredAt: createdAt,
        description: requestRow.plan_name
          ? `طلب اشتراك في ${requestRow.plan_name}.`
          : "تم إنشاء طلب الاشتراك.",
        dedupeKey: `created:${requestRow.id}`,
      })
    );
  }

  if (String(requestRow.payment_proof || "").trim()) {
    events.push(
      buildTimelineEvent("payment_proof", {
        occurredAt: createdAt,
        description: "تم إرفاق إثبات الدفع مع الطلب.",
        dedupeKey: `payment-proof:${requestRow.id}`,
      })
    );
  }

  const status = normalizeStatus(requestRow.status);
  const startedAt = requestRow.started_at || null;

  if (ACTIVATED_STATUSES.has(status) && startedAt) {
    events.push(
      buildTimelineEvent("activated", {
        occurredAt: startedAt,
        description: requestRow.plan_name
          ? `تم تفعيل ${requestRow.plan_name}.`
          : "تم تفعيل الاشتراك.",
        dedupeKey: `activated-row:${requestRow.id}:${startedAt}`,
      })
    );
  }

  return events.filter(Boolean);
}

function dedupeTimelineEvents(events = []) {
  const seen = new Set();
  const output = [];

  for (const event of events) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);
    output.push(event);
  }

  return output;
}

export function buildSubscriptionRequestTimeline(requestRow = {}, auditLogs = []) {
  const sortedLogs = [...(auditLogs || [])].sort((a, b) => {
    const aTime = new Date(a?.created_at || a?.details?.timestamp || 0).getTime();
    const bTime = new Date(b?.created_at || b?.details?.timestamp || 0).getTime();
    return aTime - bTime;
  });

  const hasDedicatedRejectLog = sortedLogs.some(
    (log) => String(log?.action || "").trim() === "reject-subscription-request"
  );

  const logEvents = sortedLogs.flatMap((log) =>
    mapAuditLogToTimelineEvents(log, { hasDedicatedRejectLog })
  );

  const hasActivatedLog = logEvents.some((event) => event?.type === "activated");
  const syntheticEvents = buildSyntheticTimelineEvents(requestRow).filter((event) => {
    if (event?.type === "activated" && hasActivatedLog) {
      return false;
    }
    return true;
  });
  const merged = dedupeTimelineEvents([...syntheticEvents, ...logEvents]);

  merged.sort((a, b) => {
    const aTime = new Date(a?.occurredAt || 0).getTime();
    const bTime = new Date(b?.occurredAt || 0).getTime();
    return aTime - bTime;
  });

  return merged;
}

export function buildSubscriptionTimelineSummary(timeline = [], auditLogs = []) {
  const adminLogs = (auditLogs || []).filter((log) =>
    SUBSCRIPTION_AUDIT_ACTIONS.has(String(log?.action || "").trim())
  );

  const lastLog = [...adminLogs].sort((a, b) => {
    const aTime = new Date(a?.created_at || 0).getTime();
    const bTime = new Date(b?.created_at || 0).getTime();
    return bTime - aTime;
  })[0];

  const lastTimelineEvent = [...(timeline || [])].sort((a, b) => {
    const aTime = new Date(a?.occurredAt || 0).getTime();
    const bTime = new Date(b?.occurredAt || 0).getTime();
    return bTime - aTime;
  })[0];

  return {
    totalEvents: timeline.length,
    lastUpdate: lastTimelineEvent?.occurredAt || null,
    lastUpdateLabel: lastTimelineEvent?.occurredAtLabel || "—",
    lastAdminEmail: resolveAdminLabel(lastLog) || lastTimelineEvent?.adminEmail || "—",
    hasAdminHistory: adminLogs.length > 0,
  };
}

export function shouldShowSparseTimelineMessage(timeline = [], auditLogs = []) {
  const adminLogs = (auditLogs || []).filter((log) =>
    SUBSCRIPTION_AUDIT_ACTIONS.has(String(log?.action || "").trim())
  );

  return adminLogs.length === 0 && timeline.length <= 2;
}

function groupAuditLogsByTargetId(logs = []) {
  const grouped = new Map();

  for (const log of logs || []) {
    const targetId = String(log?.target_id || "").trim();
    if (!targetId) continue;

    if (!grouped.has(targetId)) {
      grouped.set(targetId, []);
    }

    grouped.get(targetId).push(log);
  }

  return grouped;
}

export async function fetchSubscriptionRequestAuditLogs(supabase, requestIds = []) {
  const normalizedIds = [...new Set(requestIds.map((id) => String(id || "").trim()).filter(Boolean))];

  if (!normalizedIds.length || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("admin_logs")
    .select("id,action,target_id,admin_email,details,created_at")
    .eq("target_table", "subscription_requests")
    .in("target_id", normalizedIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn(
      "fetchSubscriptionRequestAuditLogs warning:",
      error.message || error
    );
    return [];
  }

  return data || [];
}

export async function enrichSubscriptionRequestsWithTimeline(supabase, rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const requestIds = rows.map((row) => String(row.id)).filter(Boolean);
  const auditLogs = await fetchSubscriptionRequestAuditLogs(supabase, requestIds);
  const logsByTarget = groupAuditLogsByTargetId(auditLogs);

  return rows.map((row) => {
    const requestLogs = logsByTarget.get(String(row.id)) || [];
    const timeline = buildSubscriptionRequestTimeline(row, requestLogs);
    const timelineSummary = buildSubscriptionTimelineSummary(timeline, requestLogs);
    const rejectLog = [...requestLogs]
      .reverse()
      .find((log) => String(log?.action || "").trim() === "reject-subscription-request");

    return {
      ...row,
      rejection_details: rejectLog
        ? mapSubscriptionRejectionDetailsFromAuditLog(rejectLog)
        : row.rejection_details || null,
      timeline,
      timeline_summary: timelineSummary,
      timeline_sparse: shouldShowSparseTimelineMessage(timeline, requestLogs),
    };
  });
}
