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

export async function GET() {
  try {
    const now = new Date().toISOString();

    const { data: expiredSubscriptions, error } = await supabase
      .from("subscription_requests")
      .select("id,user_email,plan_name,expires_at,expired_notice_sent")
      .eq("status", "مفعل")
      .lte("expires_at", now);

    if (error) {
      throw new Error(error.message);
    }

    for (const subscription of expiredSubscriptions || []) {
      const email = String(subscription.user_email || "").toLowerCase();
      const planName = subscription.plan_name || "اشتراك VIP";

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
        await supabase.from("notifications").insert({
          user_email: email,
          title: "انتهى اشتراكك ⚠️",
          message: `انتهت صلاحية ${planName}. اضغط لتجديد اشتراكك من صفحة الباقات.`,
          type: "subscription-expired",
          is_read: false,
        });

        await sendEmailViaResend({
          to: email,
          subject: "انتهاء الاشتراك - HasaN CharT World",
          html: `
            <div dir="rtl" style="font-family:Arial,sans-serif;padding:24px">
              <h2>انتهت صلاحية اشتراكك</h2>
              <p>انتهت صلاحية الباقة التالية:</p>
              <p><strong>${planName}</strong></p>
              <p>يمكنك تجديد الاشتراك من صفحة الباقات.</p>
              <p>
                <a href="https://www.hasanchartworld.com/subscriptions">
                  تجديد الاشتراك
                </a>
              </p>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: expiredSubscriptions?.length || 0,
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
