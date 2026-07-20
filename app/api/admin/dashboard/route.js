import { verifyAdminSession } from "../../../../lib/admin-auth";
import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { dispatchAnalysisReplyAlerts, resolveAnalysisReplyRecipientEmail } from "../../../../lib/analysis-reply-dispatch";
import { dispatchUnifiedSiteAlerts } from "../../../../lib/site-notification-dispatch.js";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import { getSiteUrl, buildEmailLayout } from "../../../../lib/email";
import { buildEmailParagraph, buildVipSignalEmailContent } from "../../../../lib/email-layout.js";
import { dispatchTransactionalEmail } from "../../../../lib/email-dispatch.js";
import { dispatchSubscriptionActivatedEmail } from "../../../../lib/subscription-activated-dispatch.js";
import { dispatchVipSignalEmail } from "../../../../lib/vip-signal-email-dispatch.js";
import {
  adminMutationLimiter,
  adminReadLimiter,
} from "../../../../lib/rate-limit";
import { invalidateReadCache, withReadCache } from "../../../../lib/server-read-cache";
import {
  ADMIN_DASHBOARD_PAGE_SIZE,
  ADMIN_DASHBOARD_SECTIONS,
  ADMIN_DASHBOARD_SECTION_CACHE_MS,
  ADMIN_DASHBOARD_STATS_CACHE_MS,
  loadAdminDashboardSection,
} from "../../../../lib/admin-dashboard-sections";
import {
  onPartnerAccountManagementActivated,
  onPartnerSubscriptionActivated,
} from "../../../../lib/partner-service-hooks";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

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
      section === "stats" ? ADMIN_DASHBOARD_STATS_CACHE_MS : ADMIN_DASHBOARD_SECTION_CACHE_MS;

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


function signalTypeLabel(signalType) {
  return signalType === "futures" ? "Futures" : "Spot";
}

function normalizeVipSignalType(value) {
  const text = String(value || "").trim().toLowerCase();

  if (
    text.includes("future") ||
    text.includes("futures") ||
    text.includes("فيوتشر") ||
    text.includes("عقود")
  ) {
    return "futures";
  }

  return "spot";
}

function matchesSignalSubscription(planText, signalType) {
  const text = String(planText || "").toLowerCase();

  if (signalType === "futures") {
    return (
      text.includes("future") ||
      text.includes("futures") ||
      text.includes("فيوتشر") ||
      text.includes("vip futures")
    );
  }

  return (
    text.includes("spot") ||
    text.includes("سبوت") ||
    text.includes("vip spot")
  );
}

function getSubscriptionDurationDays(planName) {
  const text = String(planName || "").toLowerCase();

  if (
    text.includes("year") ||
    text.includes("annual") ||
    text.includes("سنة") ||
    text.includes("سنوي")
  ) {
    return 365;
  }

  if (
    text.includes("6 month") ||
    text.includes("6 months") ||
    text.includes("ستة أشهر") ||
    text.includes("٦ أشهر") ||
    text.includes("6 اشهر") ||
    text.includes("6 أشهر")
  ) {
    return 180;
  }

  if (
    text.includes("3 month") ||
    text.includes("3 months") ||
    text.includes("ثلاثة أشهر") ||
    text.includes("٣ أشهر") ||
    text.includes("3 اشهر") ||
    text.includes("3 أشهر")
  ) {
    return 90;
  }

  if (
    text.includes("week") ||
    text.includes("أسبوع") ||
    text.includes("اسبوع")
  ) {
    return 7;
  }

  return 30;
}

function getSubscriptionExpiryDate(planName) {
  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(expiresAt.getDate() + getSubscriptionDurationDays(planName));

  return {
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function isActiveSubscriptionRow(item) {
  if (!item) return false;

  const status = String(item.status || item.subscription_status || "").trim().toLowerCase();
  const isActiveStatus = status === "مفعل" || status === "نشط" || status === "active";

  if (!isActiveStatus) return false;

  if (item.expires_at) {
    const expiresTime = new Date(item.expires_at).getTime();
    if (Number.isFinite(expiresTime) && expiresTime <= Date.now()) {
      return false;
    }
  }

  return true;
}

async function notifyVipSubscribers(supabase, signal) {
  try {
    const { signalType, coin, entry, targets, stopLoss, notes, signalId } = signal;
    const normalizedSignalType = normalizeVipSignalType(signalType);
    const label = signalTypeLabel(normalizedSignalType);

    const [subscriptionsResult, profilesResult] = await Promise.all([
      supabase
        .from("subscription_requests")
        .select("user_email,plan_name,category,status,expires_at")
        .eq("status", "مفعل"),
      supabase
        .from("profiles")
        .select("email,subscription_plan,subscription_status"),
    ]);

    if (subscriptionsResult.error) {
      console.error("VIP subscribers load error:", subscriptionsResult.error.message || subscriptionsResult.error);
    }

    if (profilesResult.error) {
      console.error("VIP subscriber profiles load error:", profilesResult.error.message || profilesResult.error);
    }

    const subscribersFromRequests = (subscriptionsResult.data || [])
      .filter(isActiveSubscriptionRow)
      .filter((item) =>
        matchesSignalSubscription(`${item.plan_name || ""} ${item.category || ""}`, normalizedSignalType)
      )
      .map((item) => String(item.user_email || "").trim().toLowerCase())
      .filter(Boolean);

    const subscribersFromProfiles = (profilesResult.data || [])
      .filter(isActiveSubscriptionRow)
      .filter((item) =>
        matchesSignalSubscription(item.subscription_plan || "", normalizedSignalType)
      )
      .map((item) => String(item.email || "").trim().toLowerCase())
      .filter(Boolean);

    const recipientEmails = [...new Set([...subscribersFromRequests, ...subscribersFromProfiles])];

    console.log("VIP signal recipients:", {
      signalType: normalizedSignalType,
      count: recipientEmails.length,
      recipientEmails,
    });

    if (recipientEmails.length === 0) return;

    const signalPagePath = normalizedSignalType === "futures" ? "/vip-futures" : "/vip-spot";
    const siteType = normalizedSignalType === "futures" ? "vip-futures" : "vip-spot";
    const notificationTitle = `🚨 توصية VIP ${label} جديدة`;
    const notificationMessage = `تم نشر توصية جديدة على ${coin}. افتح صفحة توصيات VIP ${label} للاطلاع على التفاصيل.`;
    const subject = `${notificationTitle} - ${coin}`;
    const signalPageUrl = `${getSiteUrl()}${signalPagePath}`;
    const emailContent = buildVipSignalEmailContent({
      coin,
      entry,
      targets,
      stopLoss,
      notes,
    });

    const dispatchResults = [];

    for (const email of recipientEmails) {
      const emailResult = await dispatchVipSignalEmail({
        signalId: signalId || null,
        recipientEmail: email,
        signalType: normalizedSignalType,
        coin,
        subject,
        title: notificationTitle,
        content: emailContent,
        actionText: "فتح صفحة التوصيات",
        actionUrl: signalPageUrl,
      });

      const alertResult = await dispatchUnifiedSiteAlerts(supabase, {
        preset: "vip_signal",
        userEmail: email,
        title: notificationTitle,
        message: notificationMessage,
        type: siteType,
        url: signalPagePath,
        metadata: {
          signalId: signalId || null,
          signalType: normalizedSignalType,
          coin,
          notification_key: "vip_signal",
        },
      });

      dispatchResults.push({
        ...alertResult,
        emailResult,
      });
    }

    console.log("VIP signal dispatch summary:", {
      signalType: normalizedSignalType,
      coin,
      recipients: recipientEmails.length,
      notificationsCreated: dispatchResults.filter((item) => item.notificationCreated).length,
      pushSent: dispatchResults.filter((item) => (item.pushResult?.sent || 0) > 0).length,
      emailsSent: dispatchResults.filter((item) => item.emailResult?.sent).length,
    });
  } catch (error) {
    console.error("VIP subscriber notification error:", error.message || error);
  }
}

export async function POST(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

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

      const activationDates =
        newStatus === "مفعل"
          ? getSubscriptionExpiryDate(planName)
          : null;

      const subscriptionUpdate =
        newStatus === "مفعل"
          ? {
              status: newStatus,
              started_at: activationDates.startedAt,
              expires_at: activationDates.expiresAt,
              expired_notice_sent: false,
            }
          : { status: newStatus };

      const { error } = await supabase
        .from("subscription_requests")
        .update(subscriptionUpdate)
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر تحديث طلب الاشتراك");
      }

      if (newStatus === "مفعل") {
        const emailDispatchResult = await dispatchSubscriptionActivatedEmail({
          subscriptionRequestId: requestId,
          recipientEmail: userEmail,
          planName,
          expiresAt: activationDates?.expiresAt || null,
        });

        if (userEmail) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              subscription_plan: planName || "اشتراك مفعل",
              subscription_status: "نشط",
            })
            .eq("email", userEmail);

          if (profileError) {
            throw new Error(
              profileError.message || "تم تحديث الطلب لكن تعذر تفعيل اشتراك المستخدم"
            );
          }

          await dispatchUnifiedSiteAlerts(supabase, {
            preset: "system",
            userEmail,
            title: "تم تفعيل اشتراكك بنجاح 🎉",
            message: `تم تفعيل اشتراك ${planName || "الخاص بك"} حتى تاريخ ${new Date(activationDates.expiresAt).toLocaleDateString("ar-SY-u-nu-latn")}.`,
            url: "/subscriptions",
            metadata: {
              requestId,
              planName: planName || null,
              expiresAt: activationDates.expiresAt,
              notification_key: "system",
            },
          });

          await onPartnerSubscriptionActivated(supabase, {
            subscriptionRequestId: requestId,
          });
        }
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
          expiresAt: activationDates?.expiresAt || null,
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