const REJECTED_STATUS = "مرفوض";

export function isRejectedSubscriptionStatus(status) {
  return String(status || "").trim() === REJECTED_STATUS;
}

export function mapSubscriptionRejectionDetailsFromAuditLog(logRow) {
  if (!logRow) return null;

  const details =
    logRow.details && typeof logRow.details === "object" ? logRow.details : {};

  return {
    rejectionReason: String(details.rejectionReason || "").trim() || null,
    adminNotes:
      String(details.adminNotes || details.rejectionNotes || "").trim() || null,
    rejectedAt: details.timestamp || logRow.created_at || null,
    rejectedByEmail:
      String(details.adminEmail || logRow.admin_email || "").trim() || null,
    notificationCreated: Boolean(details.notificationCreated),
    emailQueued: Boolean(details.emailQueued),
  };
}

export async function enrichSubscriptionRequestsWithRejectionDetails(
  supabase,
  rows = []
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const rejectedIds = rows
    .filter((row) => isRejectedSubscriptionStatus(row?.status))
    .map((row) => String(row.id))
    .filter(Boolean);

  if (rejectedIds.length === 0) {
    return rows;
  }

  const { data: logs, error } = await supabase
    .from("admin_logs")
    .select("target_id,admin_email,details,created_at")
    .eq("action", "reject-subscription-request")
    .in("target_id", rejectedIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn(
      "enrichSubscriptionRequestsWithRejectionDetails warning:",
      error.message || error
    );
    return rows;
  }

  const latestByTarget = new Map();

  for (const log of logs || []) {
    const targetId = String(log?.target_id || "").trim();
    if (!targetId || latestByTarget.has(targetId)) continue;
    latestByTarget.set(targetId, log);
  }

  return rows.map((row) => {
    const log = latestByTarget.get(String(row.id));
    if (!log) return row;

    return {
      ...row,
      rejection_details: mapSubscriptionRejectionDetailsFromAuditLog(log),
    };
  });
}

export function formatSubscriptionRejectionDetailsForAdmin(details) {
  if (!details || typeof details !== "object") return null;

  const rejectedAt = details.rejectedAt
    ? new Date(details.rejectedAt).toLocaleString("ar-SY-u-nu-latn")
    : "—";

  return {
    rejectionReason: details.rejectionReason || "—",
    adminNotes: details.adminNotes || "لا توجد ملاحظات إضافية",
    rejectedAt,
    rejectedByEmail: details.rejectedByEmail || "—",
    notificationStatus: details.notificationCreated ? "تم" : "تعذر",
    emailStatus: details.emailQueued
      ? "تم وضعه في قائمة الإرسال"
      : "تعذر",
  };
}
