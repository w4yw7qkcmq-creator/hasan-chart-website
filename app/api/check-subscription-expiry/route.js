import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "../../../lib/admin-auth";
import { getSiteUrl, sendTemplateEmail } from "../../../lib/email";
import { buildSubscriptionExpiryEmailContent } from "../../../lib/email-layout.js";
import { processEmailQueue } from "../../../lib/email-queue";
import { NOTIFICATION_SOUND_KEYS } from "../../../lib/notification-sound-keys.js";
import {
  dispatchSiteNotification,
  shouldDeliverEmailToRecipient,
} from "../../../lib/site-notification-dispatch.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const DAY_MS = 24 * 60 * 60 * 1000;

function getDaysUntilExpiry(expiresAt) {
  if (!expiresAt) return null;

  const expiresTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresTime)) return null;

  return Math.ceil((expiresTime - Date.now()) / DAY_MS);
}

async function queueRenewalReminder({ email, planName, daysLeft }) {
  const title =
    daysLeft === 1
      ? "باقي يوم واحد على انتهاء اشتراكك ⏳"
      : "باقي 3 أيام على انتهاء اشتراكك ⏳";

  const message =
    daysLeft === 1
      ? `باقي يوم واحد على انتهاء ${planName}. يمكنك التجديد من صفحة الباقات.`
      : `باقي 3 أيام على انتهاء ${planName}. يمكنك التجديد من صفحة الباقات.`;

  await dispatchSiteNotification(supabase, {
    preset: "subscription_renewal",
    userEmail: email,
    title,
    message,
    metadata: { planName, daysLeft, variant: "reminder" },
  });

  const emailAllowed = await shouldDeliverEmailToRecipient(supabase, {
    userEmail: email,
    notificationKey: NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
  });

  if (!emailAllowed) {
    return null;
  }

  return {
    to: email,
    send: () =>
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
  };
}

async function queueExpiredNotice({ email, planName }) {
  await dispatchSiteNotification(supabase, {
    preset: "subscription_expiry",
    userEmail: email,
    title: "انتهى اشتراكك ⚠️",
    message: `انتهت صلاحية ${planName}. اضغط لتجديد اشتراكك من صفحة الباقات.`,
    metadata: { planName, variant: "expired" },
  });

  const emailAllowed = await shouldDeliverEmailToRecipient(supabase, {
    userEmail: email,
    notificationKey: NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
  });

  if (!emailAllowed) {
    return null;
  }

  return {
    to: email,
    send: () =>
      sendTemplateEmail({
        to: email,
        subject: "انتهاء الاشتراك - HasaN CharT World",
        title: "انتهت صلاحية اشتراكك ⚠️",
        content: buildSubscriptionExpiryEmailContent({
          planName,
          variant: "expired",
        }),
        actionText: "تجديد الاشتراك",
        actionUrl: `${getSiteUrl()}/subscriptions`,
      }),
  };
}

export async function GET(request) {
  try {
    const authCheck = verifyCronSecret(request);

    if (!authCheck.ok) {
      return NextResponse.json(
        {
          success: false,
          error: authCheck.error,
        },
        { status: authCheck.status }
      );
    }

    const now = new Date().toISOString();

    const { data: activeSubscriptions, error: activeError } = await supabase
      .from("subscription_requests")
      .select(
        "id,user_email,plan_name,expires_at,expired_notice_sent,reminder_3d_sent"
      )
      .eq("status", "مفعل")
      .not("expires_at", "is", null);

    if (activeError) {
      throw new Error(activeError.message);
    }

    let remindersSent = 0;
    let expiredProcessed = 0;
    const emailJobs = [];

    for (const subscription of activeSubscriptions || []) {
      const email = String(subscription.user_email || "").trim().toLowerCase();
      const planName = subscription.plan_name || "اشتراك VIP";
      const daysLeft = getDaysUntilExpiry(subscription.expires_at);

      if (!email || daysLeft === null) continue;

      if (daysLeft <= 0) {
        await supabase
          .from("subscription_requests")
          .update({
            status: "منتهي",
            expired_notice_sent: true,
          })
          .eq("id", subscription.id);

        await supabase
          .from("profiles")
          .update({
            subscription_status: "منتهي",
            subscription_plan: null,
          })
          .eq("email", email);

        if (!subscription.expired_notice_sent) {
          const emailJob = await queueExpiredNotice({ email, planName });
          if (emailJob) {
            emailJobs.push(emailJob);
          }
        }

        expiredProcessed += 1;
        continue;
      }

      if (daysLeft === 3 && !subscription.reminder_3d_sent) {
        const emailJob = await queueRenewalReminder({ email, planName, daysLeft: 3 });
        if (emailJob) {
          emailJobs.push(emailJob);
        }

        await supabase
          .from("subscription_requests")
          .update({ reminder_3d_sent: true })
          .eq("id", subscription.id);

        remindersSent += 1;
      }
    }

    const emailStats =
      emailJobs.length > 0
        ? await processEmailQueue(emailJobs, {
            label: "subscription-expiry",
          })
        : {
            sentCount: 0,
            failedCount: 0,
            skippedCount: 0,
            failedEmails: [],
          };

    return NextResponse.json({
      success: true,
      checked: activeSubscriptions?.length || 0,
      remindersSent,
      expiredProcessed,
      emailStats,
      now,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
