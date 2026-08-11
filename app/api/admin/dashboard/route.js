import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { dispatchAnalysisReplyAlerts, resolveAnalysisReplyRecipientEmail } from "../../../../lib/analysis-reply-dispatch";
import { dispatchUnifiedSiteAlerts } from "../../../../lib/site-notification-dispatch.js";
import { getSiteUrl, buildEmailLayout } from "../../../../lib/email";
import { buildEmailParagraph } from "../../../../lib/email-layout.js";
import { dispatchTransactionalEmail } from "../../../../lib/email-dispatch.js";
import { activateSubscriptionRequest } from "../../../../lib/admin-subscription-request-activate.js";
import { invalidateReadCache, withReadCache } from "../../../../lib/server-read-cache";
import {
  ADMIN_DASHBOARD_PAGE_SIZE,
  ADMIN_DASHBOARD_SECTIONS,
  ADMIN_DASHBOARD_SECTION_CACHE_MS,
  ADMIN_DASHBOARD_STATS_CACHE_MS,
  ADMIN_ACTIVITY_FEED_CACHE_MS,
  loadAdminDashboardSection,
} from "../../../../lib/admin-dashboard-sections";
import {
  onPartnerAccountManagementActivated,
} from "../../../../lib/partner-service-hooks";
import {
  normalizeVipSignalType,
  notifyVipSubscribers,
} from "../../../../lib/vip-subscriber-notify.js";
import { countEligibleVipRecipients } from "../../../../lib/vip-recommendation-eligibility.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.DASHBOARD_READ, { request });

    if (!adminCheck.ok) {
      const headers = {};
      if (adminCheck.status === 429 && adminCheck.retryAfterSeconds) {
        headers["Retry-After"] = String(adminCheck.retryAfterSeconds);
      }
      return Response.json(
        {
          success: false,
          error: adminCheck.error,
          ...(adminCheck.code ? { code: adminCheck.code } : {}),
          ...(adminCheck.retryAfterSeconds ? { retryAfterSeconds: adminCheck.retryAfterSeconds } : {}),
        },
        { status: adminCheck.status, headers }
      );
    }

    const adminEmail = String(adminCheck.user?.email || "admin").toLowerCase();
    const { searchParams } = new URL(request.url);
    const section = String(searchParams.get("section") || "stats").trim().toLowerCase();
    const limit = Number(searchParams.get("limit") || ADMIN_DASHBOARD_PAGE_SIZE);

    if (!ADMIN_DASHBOARD_SECTIONS.has(section)) {
      return Response.json(
        { success: false, error: "قسم غير مدعوم" },
        { status: 400 }
      );
    }

    const cacheTtl =
      section === "stats"
        ? ADMIN_DASHBOARD_STATS_CACHE_MS
        : section === "activity-feed"
        ? ADMIN_ACTIVITY_FEED_CACHE_MS
        : ADMIN_DASHBOARD_SECTION_CACHE_MS;

    const { data: sectionPayload } = await withReadCache(
      `admin-dashboard:${adminEmail}:${section}`,
      cacheTtl,
      async () =>
        loadAdminDashboardSection(adminCheck.supabase, section, {
          limit,
        })
    );

    return Response.json(sectionPayload, {
      headers: {
        "Cache-Control": CACHE_NO_STORE,
        Vary: "Accept-Encoding",
      },
    });
  } catch (error) {
    console.error("Admin dashboard API error:", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "حدث خطأ أثناء تحميل البيانات",
      },
      { status: error?.status || 500 }
    );
  }
}

// --- Secure POST actions for account-management requests ---

async function writeAdminLog(supabase, {
  admin,
  action,
  targetTable,
  targetId,
  details = {},
}) {
  try {
    await supabase.from("admin_logs").insert({
      admin_id: admin?.id || null,
      admin_email: admin?.email || null,
      action,
      target_table: targetTable,
      target_id: String(targetId || ""),
      details,
    });
  } catch (error) {
    console.error("Admin log error:", error.message);
  }
}

const SHARED_ADMIN_STATUSES = ["بانتظار المراجعة", "تمت المراجعة"];

function normalizeAdminRequestStatus(status) {
  const raw = String(status || "").trim();
  const lower = raw.toLowerCase();

  if (
    lower === "reviewed" ||
    lower === "approved" ||
    lower === "completed" ||
    raw === "تمت المراجعة"
  ) {
    return "تمت المراجعة";
  }

  if (
    lower === "pending" ||
    lower === "new" ||
    lower === "reviewing" ||
    raw === "بانتظار المراجعة"
  ) {
    return "بانتظار المراجعة";
  }

  return raw;
}

const ADMIN_STATUS_TABLES = {
  subscription_requests: {
    table: "subscription_requests",
    allowedStatuses: [
      ...SHARED_ADMIN_STATUSES,
      "تم التواصل",
      "قيد التفعيل",
      "مفعل",
      "مرفوض",
      "مؤرشف",
    ],
  },
  analysis_requests: {
    table: "analysis_requests",
    allowedStatuses: [
      ...SHARED_ADMIN_STATUSES,
      "قيد المراجعة",
      "قيد التحليل",
      "مكتمل",
      "تم الرد",
      "مرفوض",
      "مؤرشف",
    ],
  },
  account_management_requests: {
    table: "account_management_requests",
    allowedStatuses: [
      ...SHARED_ADMIN_STATUSES,
      "جديد",
      "قيد المراجعة",
      "نشط",
      "مغلق",
      "مرفوض",
      "مؤرشف",
    ],
  },
};

function getAdminStatusTable(tableName) {
  return ADMIN_STATUS_TABLES[String(tableName || "").trim()] || null;
}

const ADMIN_STATUS_ROW_SELECT = {
  account_management_requests: "id, email, user_id, platform",
  analysis_requests: "id, user_email, coin, reply",
  subscription_requests: "id, user_email",
};

function getAdminStatusRowSelect(tableName) {
  return ADMIN_STATUS_ROW_SELECT[String(tableName || "").trim()] || "id";
}

function isAccountManagementApprovedStatus(status) {
  const normalized = String(status || "").trim();
  return normalized === "نشط" || normalized === "تمت المراجعة";
}

async function resolveAccountManagementEmail(supabase, row) {
  const directEmail = String(row?.email || "").trim().toLowerCase();
  if (directEmail) return directEmail;

  const userId = row?.user_id;
  if (!userId) return "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  return String(profile?.email || "").trim().toLowerCase();
}


export async function POST(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.DASHBOARD_MUTATIONS, { request });

    if (!adminCheck.ok) {
      const headers = {};
      if (adminCheck.status === 429 && adminCheck.retryAfterSeconds) {
        headers["Retry-After"] = String(adminCheck.retryAfterSeconds);
      }
      return Response.json(
        {
          success: false,
          error: adminCheck.error,
          ...(adminCheck.code ? { code: adminCheck.code } : {}),
          ...(adminCheck.retryAfterSeconds ? { retryAfterSeconds: adminCheck.retryAfterSeconds } : {}),
        },
        { status: adminCheck.status, headers }
      );
    }

    const supabase = adminCheck.supabase;
    const adminUser = adminCheck.user;
    const invalidateDashboardCache = () => {
      invalidateReadCache(`admin-dashboard:${String(adminUser?.email || "admin").toLowerCase()}:`);
    };

    const payload = await request.json();
    const { action, requestId } = payload;

    if (!action || !requestId) {
      return Response.json(
        { success: false, error: "بيانات الطلب غير مكتملة" },
        { status: 400 }
      );
    }

    if (action === "update-request-status") {
      const targetTableConfig = getAdminStatusTable(payload.table);
      const newStatus = normalizeAdminRequestStatus(payload.status);

      if (!targetTableConfig) {
        return Response.json(
          { success: false, error: "نوع الطلب غير مدعوم" },
          { status: 400 }
        );
      }

      if (!targetTableConfig.allowedStatuses.includes(newStatus)) {
        return Response.json(
          { success: false, error: "الحالة غير مدعومة لهذا النوع من الطلبات" },
          { status: 400 }
        );
      }

      const { data: existingRow, error: fetchError } = await supabase
        .from(targetTableConfig.table)
        .select(getAdminStatusRowSelect(targetTableConfig.table))
        .eq("id", requestId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(fetchError.message || "تعذر قراءة بيانات الطلب");
      }

      const { error } = await supabase
        .from(targetTableConfig.table)
        .update({ status: newStatus })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر تحديث حالة الطلب");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "update-request-status",
        targetTable: targetTableConfig.table,
        targetId: requestId,
        details: {
          status: newStatus,
        },
      });

      if (
        targetTableConfig.table === "account_management_requests" &&
        isAccountManagementApprovedStatus(newStatus)
      ) {
        const userEmail = await resolveAccountManagementEmail(supabase, existingRow);
        const platformLabel = String(existingRow?.platform || "المنصة").trim();

        if (userEmail) {
          await dispatchUnifiedSiteAlerts(supabase, {
            preset: "account_management",
            userEmail,
            userId: existingRow?.user_id || null,
            title: "تم قبول طلب إدارة حسابك ✅",
            message: `تم تفعيل طلب إدارة حسابك على ${platformLabel}.`,
            metadata: {
              requestId,
              platform: existingRow?.platform || null,
              notification_key: "account_management",
            },
          });

          const title = "تم قبول طلب إدارة حسابك ✅";
          const content = buildEmailParagraph(
            `تم تفعيل طلب إدارة حسابك على ${platformLabel}. يمكنك متابعة التفاصيل من لوحة التحكم.`
          );
          const actionText = "فتح لوحة التحكم";
          const actionUrl = `${getSiteUrl()}/my-dashboard`;

          console.log("ACCOUNT_MANAGEMENT_APPROVED_EMAIL_DISPATCH_STARTED", {
            requestId,
            userEmail,
            status: newStatus,
          });

          const emailDispatchResult = await dispatchTransactionalEmail({
            idempotencyKey: `account_mgmt_approved:${requestId}`,
            recipientEmail: userEmail,
            subject: title,
            html: buildEmailLayout({ title, content, actionText, actionUrl }),
            messageType: "account_management_approved",
            recordId: requestId,
            metadata: {
              source: "account_management_approved",
              accountManagementRequestId: requestId,
              userEmail,
              platform: existingRow?.platform || null,
            },
          });

          console.log("ACCOUNT_MANAGEMENT_APPROVED_EMAIL_DISPATCH_RESULT", {
            requestId,
            userEmail,
            status: newStatus,
            success: emailDispatchResult?.success === true,
            mode: emailDispatchResult?.mode || null,
            enqueued: Boolean(emailDispatchResult?.enqueued),
            duplicate: Boolean(emailDispatchResult?.duplicate),
            outboxId: emailDispatchResult?.record?.id || null,
            error: emailDispatchResult?.error || null,
          });
        }

        await onPartnerAccountManagementActivated(supabase, {
          requestId,
          userId: existingRow?.user_id || null,
          userEmail,
          username: existingRow?.username || null,
          capital: existingRow?.capital || null,
        });
      }

      if (
        targetTableConfig.table === "analysis_requests" &&
        (newStatus === "مكتمل" || newStatus === "تم الرد")
      ) {
        const userEmail = String(existingRow?.user_email || "").trim().toLowerCase();
        const replyText = String(existingRow?.reply || "").trim();

        if (userEmail && replyText) {
          await dispatchAnalysisReplyAlerts({
            supabase,
            userEmail,
            coin: existingRow?.coin,
            reply: replyText,
            requestId,
          });
        }
      }

      invalidateDashboardCache();
      return Response.json({ success: true });
    }

    if (action === "publish-vip-signal") {
      const signalType = normalizeVipSignalType(payload.signalType);
      const coin = String(payload.coin || "").trim().toUpperCase();
      const entry = String(payload.entry || "").trim();
      const targets = String(payload.targets || "").trim();
      const stopLoss = String(payload.stopLoss || "").trim();
      const notes = String(payload.notes || "").trim();

      if (!coin) {
        return Response.json(
          { success: false, error: "نوع التوصية واسم العملة مطلوبان" },
          { status: 400 }
        );
      }

      let publishRecipientCount = 0;
      try {
        publishRecipientCount = await countEligibleVipRecipients(supabase, signalType);
      } catch {
        publishRecipientCount = 0;
      }

      const { data, error } = await supabase
        .from("vip_signals")
        .insert({
          signal_type: signalType,
          coin,
          entry,
          targets,
          stop_loss: stopLoss,
          notes,
          status: "نشطة",
          trade_status: "active",
          publish_recipient_count: publishRecipientCount,
          published_by_email: adminUser?.email || null,
          published_by: adminUser?.id || null,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message || "فشل نشر توصية VIP");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "publish-vip-signal",
        targetTable: "vip_signals",
        targetId: data?.id || requestId,
        details: {
          signalType,
          coin,
        },
      });

      await notifyVipSubscribers(supabase, {
        signalType,
        coin,
        entry,
        targets,
        stopLoss,
        notes,
        signalId: data?.id || null,
      });

      invalidateDashboardCache();
      return Response.json({ success: true, id: data?.id || null });
    }

    if (action === "send-analysis-reply") {
      const reply = String(payload.reply || "").trim();
      const replyImage = String(payload.replyImage || "").trim();

      if (!reply) {
        return Response.json(
          { success: false, error: "الرد مطلوب" },
          { status: 400 }
        );
      }

      const { data: existingRequest, error: fetchError } = await supabase
        .from("analysis_requests")
        .select("id, user_email, coin")
        .eq("id", requestId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(fetchError.message || "تعذر قراءة طلب التحليل");
      }

      const { error } = await supabase
        .from("analysis_requests")
        .update({
          reply,
          reply_image: replyImage || null,
          status: "مكتمل",
          job_status: "completed",
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر إرسال الرد");
      }

      const resolvedRecipientEmail = resolveAnalysisReplyRecipientEmail(
        existingRequest?.user_email
      );

      console.log("ANALYSIS_REPLY_DISPATCH_STARTED", {
        requestId,
        action: "send-analysis-reply",
        hasExistingRequest: Boolean(existingRequest),
      });

      console.log("ANALYSIS_REPLY_RECIPIENT_RESOLVED", {
        requestId,
        userEmail: resolvedRecipientEmail || null,
        hasRecipient: Boolean(resolvedRecipientEmail),
      });

      const alertResult = await dispatchAnalysisReplyAlerts({
        supabase,
        userEmail: resolvedRecipientEmail,
        coin: existingRequest?.coin,
        reply,
        requestId,
      });

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "send-analysis-reply",
        targetTable: "analysis_requests",
        targetId: requestId,
        details: {
          hasImage: Boolean(replyImage),
          notificationCreated: alertResult.notificationCreated,
          emailSent: Boolean(alertResult.emailResult?.sent),
        },
      });

      return Response.json({
        success: true,
        notificationCreated: alertResult.notificationCreated,
        emailSent: Boolean(alertResult.emailResult?.sent),
        pushSent: (alertResult.pushResult?.sent || 0) > 0,
      });
    }

    if (action === "update-subscription-request") {
      const newStatus = normalizeAdminRequestStatus(payload.status);
      const userEmail = String(payload.userEmail || "").trim().toLowerCase();
      const planName = String(payload.planName || "").trim();

      if (!newStatus) {
        return Response.json(
          { success: false, error: "حالة الاشتراك مطلوبة" },
          { status: 400 }
        );
      }

      if (newStatus === "مفعل") {
        const activationResult = await activateSubscriptionRequest(supabase, {
          adminUser,
          requestId,
          userEmail,
          planName,
        });

        invalidateDashboardCache();
        return Response.json({
          success: true,
          notificationCreated: Boolean(activationResult.notificationCreated),
          emailQueued: Boolean(activationResult.emailQueued),
          auditLogged: Boolean(activationResult.auditLogged),
          profileUpdated: activationResult.profileUpdated === true,
          partnerHookCompleted: activationResult.partnerHookCompleted,
          warnings: Array.isArray(activationResult.warnings)
            ? activationResult.warnings
            : [],
          eventType: activationResult.eventType || "subscription.activated",
          duplicate: Boolean(activationResult.duplicate),
        });
      }

      const { error } = await supabase
        .from("subscription_requests")
        .update({ status: newStatus })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر تحديث طلب الاشتراك");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "update-subscription-request",
        targetTable: "subscription_requests",
        targetId: requestId,
        details: {
          status: newStatus,
          userEmail,
          planName,
          expiresAt: null,
        },
      });

      invalidateDashboardCache();
      return Response.json({ success: true });
    }

    if (action === "approve-account-request") {
      const { error } = await supabase
        .from("account_management_requests")
        .update({ status: "قيد المراجعة" })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر تحديث الطلب");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "approve-account-request",
        targetTable: "account_management_requests",
        targetId: requestId,
      });

      invalidateDashboardCache();
      return Response.json({ success: true });
    }

    if (action === "delete-analysis-request") {
      const { error } = await supabase
        .from("analysis_requests")
        .delete()
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر حذف طلب التحليل");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "delete-analysis-request",
        targetTable: "analysis_requests",
        targetId: requestId,
      });

      invalidateDashboardCache();
      return Response.json({ success: true });
    }

    if (action === "delete-account-request") {
      const { error } = await supabase
        .from("account_management_requests")
        .delete()
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر حذف الطلب");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "delete-account-request",
        targetTable: "account_management_requests",
        targetId: requestId,
      });

      invalidateDashboardCache();
      return Response.json({ success: true });
    }

    return Response.json(
      { success: false, error: "إجراء غير معروف" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Admin dashboard action error:", error.message);

    return Response.json(
      { success: false, error: error.message || "تعذر تنفيذ الإجراء" },
      { status: 500 }
    );
  }
}