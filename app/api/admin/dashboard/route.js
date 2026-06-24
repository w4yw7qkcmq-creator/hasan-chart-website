import { verifyAdminSession } from "../../../../lib/admin-auth";
import { getSiteUrl, sendTemplateEmail } from "../../../../lib/email";
import { buildEmailLogoHtml } from "../../../../lib/email-branding.js";
import { processEmailQueue } from "../../../../lib/email-queue";
import {
  sendAccountManagementAcceptedPush,
  sendAnalysisReadyPush,
  sendVipSignalPush,
} from "../../../../lib/push-notifications";

export const dynamic = "force-dynamic";

function sanitizeAccountRequest(item) {
  return {
    id: item.id,
    user_id: item.user_id,
    email: item.email,
    platform: item.platform,
    account_type: item.account_type,
    capital: item.capital,
    contact_method: item.contact_method,
    notes: item.notes,
    status: item.status,
    created_at: item.created_at,
    has_sensitive_keys: Boolean(
      item.api_key_encrypted ||
        item.secret_key_encrypted ||
        item.trading_password_encrypted
    ),
  };
}

function buildAdminDashboardNotifications({ subscriptions = [], accounts = [] }) {
  const subscriptionNotifications = (subscriptions || [])
    .filter((item) => {
      const status = String(item.status || "بانتظار المراجعة").trim();
      return status === "بانتظار المراجعة" || status === "قيد المعالجة" || status === "جديد";
    })
    .map((item) => ({
      id: `subscription-${item.id}`,
      type: "subscription_request",
      title: "طلب اشتراك جديد 💳",
      message: `طلب اشتراك جديد في ${item.plan_name || item.category || "باقات التوصيات"} من ${item.user_email || item.username || "مستخدم جديد"}.`,
      targetSection: "subscriptions",
      targetId: item.id,
      created_at: item.created_at || null,
    }));

  const accountNotifications = (accounts || [])
    .filter((item) => {
      const status = String(item.status || "جديد").trim();
      return status === "جديد" || status === "بانتظار المراجعة";
    })
    .map((item) => ({
      id: `account-${item.id}`,
      type: "account_management_request",
      title: "طلب إدارة حساب جديد 📂",
      message: `طلب إدارة حساب جديد من ${item.email || item.contact_method || "مستخدم جديد"}.`,
      targetSection: "accounts",
      targetId: item.id,
      created_at: item.created_at || null,
    }));

  return [...subscriptionNotifications, ...accountNotifications]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 20);
}

export async function GET() {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const supabase = adminCheck.supabase;

    const [analysis, accounts, subscriptions, profiles] = await Promise.all([
      supabase
        .from("analysis_requests")
        .select(
          "id,user_email,username,coin,frame,status,reply,reply_image,created_at,job_status,completed_at,error_message"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("account_management_requests")
        .select(
          "id,user_id,email,platform,account_type,capital,contact_method,notes,status,created_at,api_key_encrypted,secret_key_encrypted,trading_password_encrypted"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("subscription_requests")
        .select(
          "id,user_email,username,plan_name,category,price,telegram_username,payment_proof,status,started_at,expires_at,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("profiles")
        .select(
          "id,email,username,telegram,role,subscription_plan,subscription_status,created_at"
        )
        .limit(500),
    ]);

    const tableErrors = {
      analysis: analysis.error?.message || null,
      accounts: accounts.error?.message || null,
      subscriptions: subscriptions.error?.message || null,
      profiles: profiles.error?.message || null,
    };

    if (analysis.error || accounts.error || subscriptions.error || profiles.error) {
      console.error("Admin dashboard data load warning:", tableErrors);
    }

    console.log("Admin dashboard counts:", {
      analysis: analysis.data?.length || 0,
      accounts: accounts.data?.length || 0,
      subscriptions: subscriptions.data?.length || 0,
      profiles: profiles.data?.length || 0,
    });

    const adminNotifications = buildAdminDashboardNotifications({
      subscriptions: subscriptions.error ? [] : subscriptions.data || [],
      accounts: accounts.error ? [] : accounts.data || [],
    });

    return Response.json({
      success: true,
      analysis_requests: analysis.error ? [] : analysis.data || [],
      account_management_requests: accounts.error
        ? []
        : (accounts.data || []).map(sanitizeAccountRequest),
      subscription_requests: subscriptions.error ? [] : subscriptions.data || [],
      profiles: profiles.error ? [] : profiles.data || [],
      table_errors: tableErrors,
      admin_notifications: adminNotifications,
      admin_notifications_count: adminNotifications.length,
    });
  } catch (error) {
    console.error("Admin dashboard API error:", error);

    return Response.json(
      {
        success: false,
        error: "حدث خطأ أثناء تحميل البيانات",
      },
      { status: 500 }
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

function buildVipSignalEmailHtml({ signalType, coin, entry, targets, stopLoss, notes }) {
  const label = signalTypeLabel(signalType);
  const logoHtml = buildEmailLogoHtml(getSiteUrl());

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; background:#f8fafc; padding:24px; color:#0f172a;">
      <div style="max-width:620px; margin:0 auto; background:white; border-radius:24px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 18px 60px rgba(15,23,42,.08);">
        <div style="background:linear-gradient(135deg,#06b6d4,#2563eb); color:white; padding:28px; text-align:center;">
          ${logoHtml}
          <div style="font-size:14px; font-weight:800; opacity:.95;">HasaN CharT World</div>
          <h1 style="margin:10px 0 0; font-size:26px;">🚨 توصية VIP ${label} جديدة</h1>
        </div>
        <div style="padding:26px;">
          <h2 style="margin:0 0 18px; font-size:24px;">${coin}</h2>
          <div style="display:grid; gap:12px;">
            <div style="background:#ecfeff; border:1px solid #bae6fd; border-radius:16px; padding:14px;"><b>منطقة الدخول:</b><br/>${entry || "غير محدد"}</div>
            <div style="background:#ecfdf5; border:1px solid #bbf7d0; border-radius:16px; padding:14px;"><b>الأهداف:</b><br/>${String(targets || "غير محدد").replace(/\n/g, "<br/>")}</div>
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:16px; padding:14px;"><b>وقف الخسارة:</b><br/>${stopLoss || "غير محدد"}</div>
            ${notes ? `<div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:16px; padding:14px;"><b>ملاحظات:</b><br/>${String(notes).replace(/\n/g, "<br/>")}</div>` : ""}
          </div>
          <p style="margin-top:22px; color:#64748b; font-size:13px; line-height:1.8;">هذه الرسالة مخصصة للمشتركين في توصيات VIP. يرجى الالتزام بإدارة رأس المال.</p>
        </div>
      </div>
    </div>
  `;
}

async function sendEmailViaResend({ to, subject, html }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "HasaN CharT World <support@hasanchartworld.com>";

  if (!resendApiKey || !to) {
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Email provider error");
  }

  return response.json().catch(() => ({ success: true }));
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

    await supabase.from("notifications").insert(
      recipientEmails.map((email) => ({
        user_email: email,
        title: `🚨 توصية VIP ${label} جديدة`,
        message: `تم نشر توصية جديدة على ${coin}. افتح صفحة توصيات VIP ${label} للاطلاع على التفاصيل.`,
        type: normalizedSignalType === "futures" ? "vip-futures" : "vip-spot",
        is_read: false,
      }))
    );

    const subject = `🚨 توصية VIP ${label} جديدة - ${coin}`;
    const signalPageUrl = `${getSiteUrl()}${normalizedSignalType === "futures" ? "/vip-futures" : "/vip-spot"}`;

    const emailContent = `
      <h2 style="margin:0 0 18px;font-size:24px">${coin}</h2>
      <div style="display:grid;gap:12px">
        <div style="background:#ecfeff;border:1px solid #bae6fd;border-radius:16px;padding:14px"><b>منطقة الدخول:</b><br/>${entry || "غير محدد"}</div>
        <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:16px;padding:14px"><b>الأهداف:</b><br/>${String(targets || "غير محدد").replace(/\n/g, "<br/>")}</div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:16px;padding:14px"><b>وقف الخسارة:</b><br/>${stopLoss || "غير محدد"}</div>
        ${notes ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:14px"><b>ملاحظات:</b><br/>${String(notes).replace(/\n/g, "<br/>")}</div>` : ""}
      </div>
      <p style="margin-top:22px;color:#64748b;font-size:13px;line-height:1.8">هذه الرسالة مخصصة للمشتركين في توصيات VIP. يرجى الالتزام بإدارة رأس المال.</p>
    `;

    const emailStats = await processEmailQueue(
      recipientEmails.map((email) => ({
        to: email,
        send: () =>
          sendTemplateEmail({
            to: email,
            subject,
            title: `🚨 توصية VIP ${label} جديدة`,
            content: emailContent,
            actionText: "فتح صفحة التوصيات",
            actionUrl: signalPageUrl,
          }),
      })),
      {
        label: `vip-${normalizedSignalType}`,
      }
    );

    console.log("VIP signal email queue summary:", {
      signalType: normalizedSignalType,
      coin,
      ...emailStats,
    });

    const pushResults = await Promise.all(
      recipientEmails.map((email) =>
        sendVipSignalPush({
          supabase,
          email,
          signalType: normalizedSignalType,
          coin,
          signalId: signalId || `${normalizedSignalType}-${coin}`,
        })
      )
    );

    console.log("VIP signal push summary:", {
      signalType: normalizedSignalType,
      coin,
      recipients: recipientEmails.length,
      sent: pushResults.reduce((sum, item) => sum + (item.sent || 0), 0),
      failed: pushResults.reduce((sum, item) => sum + (item.failed || 0), 0),
      skipped: pushResults.reduce((sum, item) => sum + (item.skipped || 0), 0),
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

    const supabase = adminCheck.supabase;
    const adminUser = adminCheck.user;

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
        .select("id, user_email, email, user_id, coin, platform")
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
        newStatus === "نشط"
      ) {
        await sendAccountManagementAcceptedPush({
          supabase,
          email: existingRow?.email,
          userId: existingRow?.user_id,
          requestId,
          platform: existingRow?.platform,
        });
      }

      if (
        targetTableConfig.table === "analysis_requests" &&
        (newStatus === "مكتمل" || newStatus === "تم الرد")
      ) {
        await sendAnalysisReadyPush({
          supabase,
          email: existingRow?.user_email,
          coin: existingRow?.coin,
          requestId,
        });
      }

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
          status: "تم الرد",
        })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر إرسال الرد");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "send-analysis-reply",
        targetTable: "analysis_requests",
        targetId: requestId,
        details: {
          hasImage: Boolean(replyImage),
        },
      });

      await sendAnalysisReadyPush({
        supabase,
        email: existingRequest?.user_email,
        coin: existingRequest?.coin,
        requestId,
      });

      return Response.json({ success: true });
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

      if (newStatus === "مفعل" && userEmail) {
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

        await supabase.from("notifications").insert({
          user_email: userEmail,
          title: "تم تفعيل اشتراكك بنجاح 🎉",
          message: `تم تفعيل اشتراك ${planName || "الخاص بك"} حتى تاريخ ${new Date(activationDates.expiresAt).toLocaleDateString("ar-SY-u-nu-latn")}.`,
          type: "subscription",
          is_read: false,
        });
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