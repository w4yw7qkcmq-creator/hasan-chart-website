

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function sendEmailViaResend({ to, subject, html }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "HasaN CharT World <onboarding@resend.dev>";

  if (!resendApiKey || !to) return;

  await fetch("https://api.resend.com/emails", {
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
}

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
        .select("status,expires_at")
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
        subscription.status !== "منتهي"
      ) {
        await supabase
          .from("subscription_requests")
          .update({
            status: "منتهي",
            expired_notice_sent: true,
          })
          .eq("user_email", email);

        await supabase.from("notifications").insert({
          user_email: email,
          title: "انتهى اشتراكك ⚠️",
          message: "انتهت صلاحية اشتراكك. يمكنك التجديد من صفحة الباقات.",
          type: "subscription-expired",
          is_read: false,
        });

        await sendEmailViaResend({
          to: email,
          subject: "انتهاء الاشتراك - HasaN CharT World",
          html: `
            <div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">
              <h2>انتهت صلاحية اشتراكك</h2>
              <p>تم إيقاف الوصول إلى خدمات VIP بسبب انتهاء مدة الاشتراك.</p>
              <p><a href="https://www.hasanchartworld.com/subscriptions">تجديد الاشتراك</a></p>
            </div>
          `,
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