import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSiteUrl, sendTemplateEmail } from "../../../lib/email";
import { buildSubscriptionExpiryEmailContent } from "../../../lib/email-layout.js";
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

const normalizeSignalType = (value) => {
  const text = String(value || "spot").trim().toLowerCase();

  if (text.includes("future") || text.includes("futures") || text.includes("فيوتشر")) {
    return "futures";
  }

  return "spot";
};

const matchesSignalSubscription = (planText, signalType) => {
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
};

const getAuthenticatedEmail = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.email) {
    return null;
  }

  return String(user.email).trim().toLowerCase();
};

const isSubscriptionExpired = (subscription) => {
  if (!subscription) {
    return true;
  }

  if (subscription.status === "منتهي") {
    return true;
  }

  if (
    subscription.expires_at &&
    new Date(subscription.expires_at).getTime() <= Date.now()
  ) {
    return true;
  }

  return false;
};

const processExpiredSubscription = async (subscription, email) => {
  if (
    !subscription ||
    !subscription.expires_at ||
    new Date(subscription.expires_at).getTime() > Date.now() ||
    subscription.expired_notice_sent
  ) {
    return;
  }

  const planName = subscription.plan_name || "اشتراك VIP";

  await supabase
    .from("subscription_requests")
    .update({
      status: "منتهي",
      expired_notice_sent: true,
    })
    .eq("id", subscription.id);

  await dispatchSiteNotification(supabase, {
    preset: "subscription_expiry",
    userEmail: email,
    title: "انتهى اشتراكك ⚠️",
    message: `انتهت صلاحية ${planName}. يمكنك التجديد من صفحة الباقات.`,
    metadata: { planName, subscriptionId: subscription.id, variant: "expired" },
  });

  const emailAllowed = await shouldDeliverEmailToRecipient(supabase, {
    userEmail: email,
    notificationKey: NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
  });

  if (!emailAllowed) {
    return;
  }

  await sendTemplateEmail({
    to: email,
    subject: "انتهاء الاشتراك - HasaN CharT World",
    title: "انتهت صلاحية اشتراكك ⚠️",
    content: buildSubscriptionExpiryEmailContent({
      planName,
      variant: "expired",
    }),
    actionText: "تجديد الاشتراك",
    actionUrl: `${getSiteUrl()}/subscriptions`,
  });
};

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const signalType = normalizeSignalType(url.searchParams.get("type"));

    const email = await getAuthenticatedEmail();

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "يجب تسجيل الدخول للوصول إلى توصيات VIP.",
        },
        { status: 401 }
      );
    }

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("subscription_requests")
      .select("id,status,expires_at,expired_notice_sent,plan_name,category")
      .eq("user_email", email)
      .order("created_at", { ascending: false });

    if (subscriptionError) {
      return NextResponse.json(
        {
          success: false,
          error: subscriptionError.message,
        },
        { status: 500 }
      );
    }

    const rows = Array.isArray(subscriptions) ? subscriptions : [];

    for (const subscription of rows) {
      if (
        subscription.status === "مفعل" &&
        subscription.expires_at &&
        new Date(subscription.expires_at).getTime() <= Date.now()
      ) {
        await processExpiredSubscription(subscription, email);
      }
    }

    const activeSubscriptions = rows.filter(
      (subscription) =>
        subscription.status === "مفعل" && !isSubscriptionExpired(subscription)
    );

    const hasMatchingPlan = activeSubscriptions.some((subscription) =>
      matchesSignalSubscription(
        `${subscription.plan_name || ""} ${subscription.category || ""}`,
        signalType
      )
    );

    if (!hasMatchingPlan) {
      const hadAnySubscription = rows.length > 0;
      const subscriptionExpired =
        hadAnySubscription &&
        !activeSubscriptions.some((subscription) =>
          matchesSignalSubscription(
            `${subscription.plan_name || ""} ${subscription.category || ""}`,
            signalType
          )
        ) &&
        rows.some(
          (subscription) =>
            matchesSignalSubscription(
              `${subscription.plan_name || ""} ${subscription.category || ""}`,
              signalType
            ) && isSubscriptionExpired(subscription)
        );

      return NextResponse.json(
        {
          success: false,
          subscriptionExpired: subscriptionExpired || (hadAnySubscription && activeSubscriptions.length === 0),
          error: "لا يوجد اشتراك VIP فعال للوصول إلى هذه التوصيات.",
          signals: [],
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("vip_signals")
      .select("*")
      .eq("signal_type", signalType)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const signals = (data || []).map((item) => ({
      ...item,
      createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
    }));

    return NextResponse.json({
      success: true,
      signals,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
