const { createUserNotification } = require("./create-user-notification");
const { evaluateDeliveryForRecipient } = require("./notification-delivery-gate");
const {
  buildSubscriptionExpiryEmailContent,
  buildUnifiedEmailLayout,
  DEFAULT_SITE_URL,
} = require("./email-layout");
const { blockProductionTestRecipientSend } = require("./lib/email-recipient-guard.cjs");

const DAY_MS = 24 * 60 * 60 * 1000;

const SUBSCRIPTION_MAINTENANCE_COLUMNS =
  "id,user_email,plan_name,expires_at,expired_notice_sent,reminder_3d_sent,status";

const SUBSCRIPTION_ALERT_PRESETS = {
  subscription_renewal: {
    notificationKey: "subscription_expiry",
    type: "subscription-renewal-reminder",
    url: "/subscriptions",
  },
  subscription_expiry: {
    notificationKey: "subscription_expiry",
    type: "subscription-expired",
    url: "/subscriptions",
  },
};

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

function isSubscriptionMaintenanceWorkerEnabled() {
  const value = String(process.env.SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function getDaysUntilExpiry(expiresAt, nowMs = Date.now()) {
  if (!expiresAt) return null;

  const expiresTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresTime)) return null;

  return Math.ceil((expiresTime - nowMs) / DAY_MS);
}

function createEmptySummary() {
  return {
    checked: 0,
    expiringSoon: 0,
    expired: 0,
    profilesUpdated: 0,
    requestsUpdated: 0,
    emailsSent: 0,
    siteNotificationsCreated: 0,
    skippedAlreadyProcessed: 0,
    failed: 0,
    dryRun: false,
    durationMs: 0,
  };
}

function buildProfileSubscriptionPlanText(activeRows = []) {
  return activeRows
    .map((row) => [row.plan_name, row.category].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" | ");
}

async function fetchActiveSubscriptionRowsForUser(supabase, userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) {
    return { email: "", rows: [], activeRows: [], error: null, missingColumns: false };
  }

  const { data: rows, error } = await supabase
    .from("subscription_requests")
    .select("id,plan_name,category,status,expires_at,admin_disabled")
    .eq("user_email", email)
    .in("status", ["مفعل", "نشط", "active"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (/column .* does not exist/i.test(error.message || "")) {
      return { email, rows: [], activeRows: [], error: null, missingColumns: true };
    }
    return { email, rows: [], activeRows: [], error, missingColumns: false };
  }

  const activeRows = (rows || []).filter((row) => {
    if (row?.admin_disabled) return false;
    if (row?.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
    return true;
  });

  return {
    email,
    rows: rows || [],
    activeRows,
    error: null,
    missingColumns: false,
  };
}

async function reconcileProfileSubscriptionFromRequests(supabase, userEmail) {
  const { email, activeRows, error, missingColumns } = await fetchActiveSubscriptionRowsForUser(
    supabase,
    userEmail
  );
  if (!email || missingColumns) return;
  if (error) throw error;

  const planText = buildProfileSubscriptionPlanText(activeRows);
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      subscription_plan: planText || "بدون اشتراك",
      subscription_status: activeRows.length ? "نشط" : "غير نشط",
    })
    .eq("email", email);

  if (profileError) {
    throw profileError;
  }
}

async function reconcileProfileAfterExpiry(supabase, email, subscriptionId) {
  try {
    await reconcileProfileSubscriptionFromRequests(supabase, email);
    return { reconciled: true };
  } catch (error) {
    console.error("subscription-maintenance:profile-reconcile-failed", {
      subscriptionId,
      email,
      error: error?.message || String(error),
    });
    return { reconciled: false, error };
  }
}

async function sendSubscriptionTemplateEmail({
  to,
  subject,
  title,
  content,
  actionText,
  actionUrl,
}) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail =
    process.env.EMAIL_FROM?.trim() || "HasaN CharT World <support@hasanchartworld.com>";
  const replyTo =
    process.env.EMAIL_REPLY_TO?.trim() || "support@hasanchartworld.com";
  const normalizedEmail = String(to || "").trim().toLowerCase();

  if (!resendApiKey || !normalizedEmail) {
    return { success: false, skipped: true, reason: "missing-resend-or-recipient" };
  }

  const recipientBlocked = blockProductionTestRecipientSend({
    path: "worker/subscription-expiry-shared.js::sendSubscriptionTemplateEmail",
    to: normalizedEmail,
  });

  if (recipientBlocked) {
    return recipientBlocked;
  }

  const html = buildUnifiedEmailLayout({
    siteUrl: getSiteUrl(),
    title,
    bodyHtml: content,
    actionText,
    actionUrl,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [normalizedEmail],
      subject,
      html,
      reply_to: replyTo,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      success: false,
      skipped: false,
      error: data?.message || `Resend request failed (${response.status})`,
    };
  }

  return { success: true, id: data?.id || null };
}

async function dispatchSubscriptionAlert(
  supabase,
  { preset, userEmail, title, message, metadata, sendEmailFn }
) {
  const defaults = SUBSCRIPTION_ALERT_PRESETS[preset] || SUBSCRIPTION_ALERT_PRESETS.subscription_expiry;
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  let notificationCreated = false;

  if (normalizedEmail) {
    const notificationResult = await createUserNotification(supabase, {
      userEmail: normalizedEmail,
      title,
      message,
      type: defaults.type,
      notificationKey: defaults.notificationKey,
      url: defaults.url,
      metadata: {
        ...(metadata || {}),
        notification_key: defaults.notificationKey,
      },
    });

    notificationCreated = Boolean(notificationResult?.data?.id);
  }

  let emailSent = false;

  if (normalizedEmail && typeof sendEmailFn === "function") {
    const delivery = await evaluateDeliveryForRecipient(supabase, {
      userEmail: normalizedEmail,
      notificationKey: defaults.notificationKey,
    });

    if (delivery.email) {
      const emailResult = await sendEmailFn();
      emailSent = Boolean(emailResult?.success);
    }
  }

  return {
    notificationCreated,
    emailResult: { sent: emailSent },
  };
}

async function sendRenewalReminder({ supabase, email, planName, daysLeft, dryRun }) {
  const title =
    daysLeft === 1
      ? "باقي يوم واحد على انتهاء اشتراكك ⏳"
      : "باقي 3 أيام على انتهاء اشتراكك ⏳";

  const message =
    daysLeft === 1
      ? `باقي يوم واحد على انتهاء ${planName}. يمكنك التجديد من صفحة الباقات.`
      : `باقي 3 أيام على انتهاء ${planName}. يمكنك التجديد من صفحة الباقات.`;

  if (dryRun) {
    return { emailSent: false, siteNotificationCreated: false, dryRun: true };
  }

  const result = await dispatchSubscriptionAlert(supabase, {
    preset: "subscription_renewal",
    userEmail: email,
    title,
    message,
    metadata: { planName, daysLeft, variant: "reminder" },
    sendEmailFn: () =>
      sendSubscriptionTemplateEmail({
        to: email,
        subject: title,
        title,
        content: buildSubscriptionExpiryEmailContent({
          planName,
          message,
          variant: "reminder",
        }),
        actionText: "تجديد الاشتراك",
        actionUrl: `${getSiteUrl()}/subscriptions`,
      }),
  });

  return {
    emailSent: Boolean(result?.emailResult?.sent),
    siteNotificationCreated: Boolean(result?.notificationCreated),
  };
}

async function sendExpiredNotice({ supabase, email, planName, subscriptionId, dryRun }) {
  const title = "انتهى اشتراكك ⚠️";
  const message = `انتهت صلاحية ${planName}. اضغط لتجديد اشتراكك من صفحة الباقات.`;

  if (dryRun) {
    return { emailSent: false, siteNotificationCreated: false, dryRun: true };
  }

  const result = await dispatchSubscriptionAlert(supabase, {
    preset: "subscription_expiry",
    userEmail: email,
    title,
    message,
    metadata: {
      planName,
      subscriptionId,
      variant: "expired",
    },
    sendEmailFn: () =>
      sendSubscriptionTemplateEmail({
        to: email,
        subject: "انتهاء الاشتراك - HasaN CharT World",
        title,
        content: buildSubscriptionExpiryEmailContent({
          planName,
          variant: "expired",
        }),
        actionText: "تجديد الاشتراك",
        actionUrl: `${getSiteUrl()}/subscriptions`,
      }),
  });

  return {
    emailSent: Boolean(result?.emailResult?.sent),
    siteNotificationCreated: Boolean(result?.notificationCreated),
  };
}

async function runSubscriptionMaintenance(
  supabase,
  { dryRun = false, nowMs = Date.now() } = {}
) {
  const startedAt = Date.now();
  const summary = createEmptySummary();
  summary.dryRun = Boolean(dryRun);

  const { data: activeSubscriptions, error: activeError } = await supabase
    .from("subscription_requests")
    .select(SUBSCRIPTION_MAINTENANCE_COLUMNS)
    .eq("status", "مفعل")
    .not("expires_at", "is", null);

  if (activeError) {
    throw new Error(activeError.message || "Failed to load active subscriptions.");
  }

  summary.checked = activeSubscriptions?.length || 0;

  for (const subscription of activeSubscriptions || []) {
    try {
      const email = String(subscription.user_email || "").trim().toLowerCase();
      const planName = subscription.plan_name || "اشتراك VIP";
      const daysLeft = getDaysUntilExpiry(subscription.expires_at, nowMs);

      if (!email || daysLeft === null) {
        continue;
      }

      if (daysLeft <= 0) {
        summary.expired += 1;

        if (subscription.expired_notice_sent) {
          summary.skippedAlreadyProcessed += 1;

          if (!dryRun && subscription.status === "مفعل") {
            await supabase
              .from("subscription_requests")
              .update({ status: "منتهي" })
              .eq("id", subscription.id)
              .eq("status", "مفعل");

            summary.requestsUpdated += 1;

            const reconcileResult = await reconcileProfileAfterExpiry(
              supabase,
              email,
              subscription.id
            );
            if (reconcileResult.reconciled) {
              summary.profilesUpdated += 1;
            }
          }

          continue;
        }

        if (dryRun) {
          continue;
        }

        const { data: claimedExpiry, error: claimExpiryError } = await supabase
          .from("subscription_requests")
          .update({
            status: "منتهي",
            expired_notice_sent: true,
          })
          .eq("id", subscription.id)
          .eq("expired_notice_sent", false)
          .select("id")
          .maybeSingle();

        if (claimExpiryError) {
          throw new Error(claimExpiryError.message || "Failed to claim expired subscription.");
        }

        if (!claimedExpiry?.id) {
          summary.skippedAlreadyProcessed += 1;
          continue;
        }

        summary.requestsUpdated += 1;

        const reconcileResult = await reconcileProfileAfterExpiry(
          supabase,
          email,
          subscription.id
        );
        if (reconcileResult.reconciled) {
          summary.profilesUpdated += 1;
        }

        const noticeResult = await sendExpiredNotice({
          supabase,
          email,
          planName,
          subscriptionId: subscription.id,
          dryRun: false,
        });

        if (noticeResult.emailSent) {
          summary.emailsSent += 1;
        }

        if (noticeResult.siteNotificationCreated) {
          summary.siteNotificationsCreated += 1;
        }

        continue;
      }

      if (daysLeft === 3) {
        summary.expiringSoon += 1;

        if (subscription.reminder_3d_sent) {
          summary.skippedAlreadyProcessed += 1;
          continue;
        }

        if (dryRun) {
          continue;
        }

        const { data: claimedReminder, error: claimReminderError } = await supabase
          .from("subscription_requests")
          .update({ reminder_3d_sent: true })
          .eq("id", subscription.id)
          .eq("reminder_3d_sent", false)
          .select("id")
          .maybeSingle();

        if (claimReminderError) {
          throw new Error(claimReminderError.message || "Failed to mark reminder sent.");
        }

        if (!claimedReminder?.id) {
          summary.skippedAlreadyProcessed += 1;
          continue;
        }

        summary.requestsUpdated += 1;

        const reminderResult = await sendRenewalReminder({
          supabase,
          email,
          planName,
          daysLeft: 3,
          dryRun: false,
        });

        if (reminderResult.emailSent) {
          summary.emailsSent += 1;
        }

        if (reminderResult.siteNotificationCreated) {
          summary.siteNotificationsCreated += 1;
        }
      }
    } catch (error) {
      summary.failed += 1;
      console.error("subscription-maintenance:row-error", {
        subscriptionId: subscription?.id || null,
        error: error?.message || String(error),
      });
    }
  }

  summary.durationMs = Date.now() - startedAt;
  return summary;
}

function buildMaintenanceResponse(summary, { delegated = false, reason = null } = {}) {
  return {
    success: summary.failed === 0,
    delegated,
    reason,
    ...summary,
    remindersSent: summary.expiringSoon,
    expiredProcessed: summary.expired,
  };
}

module.exports = {
  SUBSCRIPTION_MAINTENANCE_COLUMNS,
  isSubscriptionMaintenanceWorkerEnabled,
  getDaysUntilExpiry,
  runSubscriptionMaintenance,
  buildMaintenanceResponse,
};
