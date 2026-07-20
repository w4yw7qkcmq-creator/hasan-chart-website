import { NOTIFICATION_LIST_COLUMNS } from "./supabase-query-columns.js";
import { mapSubscriptionRow, SUBSCRIPTION_LIST_COLUMNS } from "./admin-user-subscriptions.js";
import { resolveAccountStatusFromProfile } from "./account-lifecycle.js";

export const ADMIN_USER_PAGE_SIZE = 20;

export async function loadAdminUserSubscriptionsSection(supabase, userId, { page = 1 } = {}) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = ADMIN_USER_PAGE_SIZE;
  const from = (pageNumber - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email")
    .eq("id", userId)
    .maybeSingle();

  const email = String(profile?.email || "").trim().toLowerCase();
  if (!email) {
    return {
      success: true,
      section: "subscriptions",
      subscriptions: [],
      pagination: { page: pageNumber, pageSize, total: 0, totalPages: 1 },
    };
  }

  let listQuery = supabase
    .from("subscription_requests")
    .select(SUBSCRIPTION_LIST_COLUMNS, { count: "exact" })
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .range(from, to);

  let { data, count, error } = await listQuery;

  if (error && /column .* does not exist/i.test(error.message || "")) {
    const fallback = await supabase
      .from("subscription_requests")
      .select("id,user_email,plan_name,category,price,status,started_at,expires_at,created_at,payment_proof", {
        count: "exact",
      })
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .range(from, to);
    data = fallback.data;
    count = fallback.count;
    error = fallback.error;
  }

  if (error) throw error;

  const total = Number(count || 0);

  return {
    success: true,
    section: "subscriptions",
    subscriptions: (data || []).map(mapSubscriptionRow),
    pagination: {
      page: pageNumber,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    },
  };
}

export async function loadAdminUserPaymentsSection(supabase, userId) {
  const { data: profile } = await supabase.from("profiles").select("id,email").eq("id", userId).maybeSingle();
  const email = String(profile?.email || "").trim().toLowerCase();

  const { error } = await supabase.from("payments").select("id", { count: "exact", head: true }).limit(1);

  if (error && /relation .* does not exist/i.test(error.message || "")) {
    return {
      success: true,
      section: "payments",
      payments: [],
      available: false,
      message: "لا يوجد جدول مدفوعات مفعّل في النظام حالياً.",
      pagination: { page: 1, pageSize: ADMIN_USER_PAGE_SIZE, total: 0, totalPages: 1 },
    };
  }

  return {
    success: true,
    section: "payments",
    payments: [],
    available: false,
    message: "جدول المدفوعات غير مهيأ بعد للربط.",
    pagination: { page: 1, pageSize: ADMIN_USER_PAGE_SIZE, total: 0, totalPages: 1 },
  };
}

export async function loadAdminUserNotificationsSection(supabase, userId, { page = 1 } = {}) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = ADMIN_USER_PAGE_SIZE;
  const from = (pageNumber - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = String(profile?.email || "").trim().toLowerCase();

  if (!email) {
    return {
      success: true,
      section: "notifications",
      notifications: [],
      pagination: { page: pageNumber, pageSize, total: 0, totalPages: 1 },
    };
  }

  const { data, count, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_LIST_COLUMNS, { count: "exact" })
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const total = Number(count || 0);

  return {
    success: true,
    section: "notifications",
    notifications: (data || []).map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
      url: row.url || null,
    })),
    pagination: {
      page: pageNumber,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    },
  };
}

export async function loadAdminUserEmailsSection(supabase, userId, { page = 1 } = {}) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = ADMIN_USER_PAGE_SIZE;
  const from = (pageNumber - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = String(profile?.email || "").trim().toLowerCase();

  if (!email) {
    return {
      success: true,
      section: "emails",
      emails: [],
      pagination: { page: pageNumber, pageSize, total: 0, totalPages: 1 },
    };
  }

  const outboxResult = await supabase
    .from("email_outbox")
    .select(
      "id,recipient_email,subject,message_type,status,attempts,max_attempts,error,created_at,sent_at,scheduled_at",
      { count: "exact" }
    )
    .eq("recipient_email", email)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (!outboxResult.error) {
    const total = Number(outboxResult.count || 0);
    return {
      success: true,
      section: "emails",
      source: "email_outbox",
      emails: (outboxResult.data || []).map((row) => ({
        id: row.id,
        messageType: row.message_type,
        subject: row.subject,
        status: row.status,
        createdAt: row.created_at,
        sentAt: row.sent_at,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        error: row.error ? String(row.error).slice(0, 120) : null,
        retrySupported: false,
      })),
      pagination: {
        page: pageNumber,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  if (!/relation .* does not exist/i.test(outboxResult.error.message || "")) {
    throw outboxResult.error;
  }

  const messagesResult = await supabase
    .from("email_messages")
    .select("id,recipient_email,subject,message_type,status,sent_at,created_at", { count: "exact" })
    .eq("recipient_email", email)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (messagesResult.error) throw messagesResult.error;

  const total = Number(messagesResult.count || 0);

  return {
    success: true,
    section: "emails",
    source: "email_messages",
    emails: (messagesResult.data || []).map((row) => ({
      id: row.id,
      messageType: row.message_type,
      subject: row.subject,
      status: row.status,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      attempts: null,
      maxAttempts: null,
      error: null,
      retrySupported: false,
    })),
    pagination: {
      page: pageNumber,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    },
  };
}

export async function loadAdminUserNotesSection(supabase, userId, { page = 1 } = {}) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = ADMIN_USER_PAGE_SIZE;
  const from = (pageNumber - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("admin_user_notes")
    .select("id,user_id,admin_user_id,admin_email,note,created_at,updated_at", { count: "exact" })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error && /relation .* does not exist/i.test(error.message || "")) {
    return {
      success: true,
      section: "notes",
      notes: [],
      available: false,
      message: "جدول الملاحظات غير موجود بعد. نفّذ Migration يدوياً.",
      pagination: { page: pageNumber, pageSize, total: 0, totalPages: 1 },
    };
  }

  if (error) throw error;

  const total = Number(count || 0);

  return {
    success: true,
    section: "notes",
    available: true,
    notes: data || [],
    pagination: {
      page: pageNumber,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    },
  };
}

export async function loadAdminUserAuditSection(supabase, userId, { page = 1 } = {}) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = ADMIN_USER_PAGE_SIZE;
  const from = (pageNumber - 1) * pageSize;
  const to = from + pageSize - 1;

  const auditResult = await supabase
    .from("admin_audit_logs")
    .select("id,action,entity_type,entity_id,admin_email,created_at,metadata", { count: "exact" })
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (!auditResult.error) {
    const total = Number(auditResult.count || 0);
    return {
      success: true,
      section: "audit",
      logs: auditResult.data || [],
      pagination: {
        page: pageNumber,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  if (!/relation .* does not exist/i.test(auditResult.error.message || "")) {
    throw auditResult.error;
  }

  return {
    success: true,
    section: "audit",
    logs: [],
    available: false,
    message: "سجل Audit غير متاح بعد. نفّذ Migration يدوياً.",
    pagination: { page: pageNumber, pageSize, total: 0, totalPages: 1 },
  };
}

export async function loadAdminUserManagementSection(supabase, userId) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,username,role,account_status,account_status_reason,suspended_at,banned_at,deleted_at")
    .eq("id", userId)
    .maybeSingle();

  let authUser = null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    authUser = data?.user || null;
  } catch {
    authUser = null;
  }

  const accountStatus = resolveAccountStatusFromProfile(profile, authUser);

  return {
    success: true,
    section: "management",
    accountStatus,
    profile: profile || null,
    canForceLogout: true,
    canResetPassword: Boolean(profile?.email || authUser?.email),
  };
}
