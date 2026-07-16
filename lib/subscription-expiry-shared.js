import { getSiteUrl, sendTemplateEmail } from "./email.js";
import { buildSubscriptionExpiryEmailContent } from "./email-layout.js";
import { dispatchUnifiedSiteAlerts } from "./site-notification-dispatch.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const SUBSCRIPTION_MAINTENANCE_COLUMNS =
  "id,user_email,plan_name,expires_at,expired_notice_sent,reminder_3d_sent,status";

export function isSubscriptionMaintenanceWorkerEnabled() {
  const value = String(process.env.SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

export function getDaysUntilExpiry(expiresAt, nowMs = Date.now()) {
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

  const result = await dispatchUnifiedSiteAlerts(supabase, {
    preset: "subscription_renewal",
    userEmail: email,
    title,
    message,
    metadata: { planName, daysLeft, variant: "reminder" },
    sendEmail: () =>
      sendTemplateEmail({
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

  const result = await dispatchUnifiedSiteAlerts(supabase, {
    preset: "subscription_expiry",
    userEmail: email,
    title,
    message,
    metadata: {
      planName,
      subscriptionId,
      variant: "expired",
    },
    sendEmail: () =>
      sendTemplateEmail({
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

export async function runSubscriptionMaintenance(supabase, { dryRun = false, nowMs = Date.now() } = {}) {
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

            const { error: profileError } = await supabase
              .from("profiles")
              .update({
                subscription_status: "منتهي",
                subscription_plan: null,
              })
              .eq("email", email);

            if (profileError) {
              throw new Error(profileError.message || "Failed to update profile.");
            }

            summary.requestsUpdated += 1;
            summary.profilesUpdated += 1;
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

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            subscription_status: "منتهي",
            subscription_plan: null,
          })
          .eq("email", email);

        if (profileError) {
          throw new Error(profileError.message || "Failed to update profile.");
        }

        summary.requestsUpdated += 1;
        summary.profilesUpdated += 1;

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
          throw new Error(claimReminderError.message || "Failed to claim reminder slot.");
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

export function buildMaintenanceResponse(summary, { delegated = false, reason = null } = {}) {
  return {
    success: summary.failed === 0,
    delegated,
    reason,
    ...summary,
    remindersSent: summary.expiringSoon,
    expiredProcessed: summary.expired,
  };
}
