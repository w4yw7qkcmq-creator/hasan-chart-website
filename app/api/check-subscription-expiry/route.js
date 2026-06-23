import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "../../../lib/admin-auth";
import { getSiteUrl, sendTemplateEmail } from "../../../lib/email";

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

async function sendRenewalReminder({ email, planName, daysLeft }) {
  const title =
    daysLeft === 1
      ? "باقي يوم واحد على انتهاء اشتراكك ⏳"
      : "باقي 3 أيام على انتهاء اشتراكك ⏳";

  const message =
    daysLeft === 1
      ? `باقي يوم واحد على انتهاء ${planName}. يمكنك التجديد من صفحة الباقات.`
      : `باقي 3 أيام على انتهاء ${planName}. يمكنك التجديد من صفحة الباقات.`;

  await supabase.from("notifications").insert({
    user_email: email,
    title,
    message,
    type: "subscription-renewal-reminder",
    is_read: false,
  });

  await sendTemplateEmail({
    to: email,
    subject: title,
    title,
    content: `
      <p>مرحباً،</p>
      <p>${message}</p>
      <p>للاستمرار بالوصول إلى توصيات VIP والخدمات المميزة، يمكنك تجديد اشتراكك الآن.</p>
    `,
    actionText: "تجديد الاشتراك",
    actionUrl: `${getSiteUrl()}/subscriptions`,
  });
}

async function sendExpiredNotice({ email, planName }) {
  await supabase.from("notifications").insert({
    user_email: email,
    title: "انتهى اشتراكك ⚠️",
    message: `انتهت صلاحية ${planName}. اضغط لتجديد اشتراكك من صفحة الباقات.`,
    type: "subscription-expired",
    is_read: false,
  });

  await sendTemplateEmail({
    to: email,
    subject: "انتهاء الاشتراك - HasaN CharT World",
    title: "انتهت صلاحية اشتراكك ⚠️",
    content: `
      <p>انتهت صلاحية الباقة التالية:</p>
      <p style="font-size:20px"><strong>${planName}</strong></p>
      <p>تم إيقاف الوصول إلى خدمات VIP بسبب انتهاء مدة الاشتراك.</p>
      <p>يمكنك تجديد الاشتراك للعودة إلى التوصيات والخدمات المميزة.</p>
    `,
    actionText: "تجديد الاشتراك",
    actionUrl: `${getSiteUrl()}/subscriptions`,
  });
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
          await sendExpiredNotice({ email, planName });
        }

        expiredProcessed += 1;
        continue;
      }

      if (daysLeft === 3 && !subscription.reminder_3d_sent) {
        await sendRenewalReminder({ email, planName, daysLeft: 3 });

        await supabase
          .from("subscription_requests")
          .update({ reminder_3d_sent: true })
          .eq("id", subscription.id);

        remindersSent += 1;
      }
    }

    return NextResponse.json({
      success: true,
      checked: activeSubscriptions?.length || 0,
      remindersSent,
      expiredProcessed,
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
