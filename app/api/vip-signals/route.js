import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSiteUrl, sendTemplateEmail } from "../../../../lib/email";

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


export async function GET(request) {
  try {
    const url = new URL(request.url);
    const signalType = normalizeSignalType(url.searchParams.get("type"));

    const email = String(url.searchParams.get("email") || "")
      .trim()
      .toLowerCase();

    if (email) {
      const { data: subscription } = await supabase
        .from("subscription_requests")
        .select("id,status,expires_at,expired_notice_sent,plan_name")
        .eq("user_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const expired =
        !subscription ||
        subscription.status === "منتهي" ||
        (subscription.expires_at && new Date(subscription.expires_at).getTime() <= Date.now());

      if (
        subscription &&
        subscription.expires_at &&
        new Date(subscription.expires_at).getTime() <= Date.now() &&
        !subscription.expired_notice_sent
      ) {
        const planName = subscription.plan_name || "اشتراك VIP";

        await supabase
          .from("subscription_requests")
          .update({
            status: "منتهي",
            expired_notice_sent: true,
          })
          .eq("id", subscription.id);

        await supabase.from("notifications").insert({
          user_email: email,
          title: "انتهى اشتراكك ⚠️",
          message: `انتهت صلاحية ${planName}. يمكنك التجديد من صفحة الباقات.`,
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

      if (expired) {
        return NextResponse.json({
          success: false,
          subscriptionExpired: true,
          signals: [],
        });
      }
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