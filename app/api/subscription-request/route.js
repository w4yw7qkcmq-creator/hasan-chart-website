import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSessionUser } from "../../../lib/auth-session";
import {
  RATE_LIMIT_ERROR,
  subscriptionRequestLimiter,
} from "../../../lib/rate-limit";
import { getSiteUrl, sendTemplateEmail } from "../../../lib/email";
import { buildAdminSubscriptionRequestEmailContent } from "../../../lib/email-layout.js";

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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_REPLY_TO || "support@hasanchartworld.com";

async function sendAdminSubscriptionRequestEmail({ userEmail, username, planName, category, price, telegramUsername, paymentProof }) {
  const isInlinePaymentProof = String(paymentProof || "").startsWith("data:image");
  const paymentProofHtml = isInlinePaymentProof
    ? "صورة إثبات الدفع محفوظة داخل الطلب ويمكن عرضها من لوحة الإدارة."
    : paymentProof
    ? `<a href="${paymentProof}" style="color:#67e8f9;font-weight:800;text-decoration:none">فتح صورة إثبات الدفع</a>`
    : "غير مرفق";

  await sendTemplateEmail({
    to: ADMIN_EMAIL,
    subject: "طلب اشتراك جديد - HasaN CharT World",
    title: "طلب اشتراك جديد 💳",
    content: buildAdminSubscriptionRequestEmailContent({
      planName,
      category,
      price,
      userEmail,
      username,
      telegramUsername,
      paymentProofHtml,
    }),
    actionText: "فتح لوحة الإدارة",
    actionUrl: `${getSiteUrl()}/admin`,
  });
}

export async function POST(request) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return NextResponse.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً.",
        },
        { status: 401 }
      );
    }

    const rateLimitResult = await subscriptionRequestLimiter(session.id);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: RATE_LIMIT_ERROR,
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const userEmail = session.email;
    const username = String(body.username || session.username || userEmail).trim();
    const planName = String(body.plan_name || "").trim();
    const category = String(body.category || "").trim();
    const price = String(body.price || "").trim();
    const telegramUsername = String(body.telegram_username || "").trim();
    const paymentProof = String(body.payment_proof || "").trim();

    if (!planName || !category || !price || !telegramUsername || !paymentProof) {
      return NextResponse.json(
        {
          success: false,
          error: "بيانات طلب الاشتراك غير مكتملة",
        },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("subscription_requests").insert([
      {
        user_email: userEmail,
        username,
        plan_name: planName,
        category,
        price,
        telegram_username: telegramUsername,
        payment_proof: paymentProof,
        status: "بانتظار المراجعة",
      },
    ]);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    try {
      const emailResult = await sendAdminSubscriptionRequestEmail({
        userEmail,
        username,
        planName,
        category,
        price,
        telegramUsername,
        paymentProof,
      });

      if (emailResult?.success === false) {
        console.error("Admin subscription email failed:", emailResult);
      }
    } catch (emailError) {
      console.error("Admin subscription email error:", emailError?.message || emailError);
    }

    return NextResponse.json({
      success: true,
      message: "تم إرسال طلب الاشتراك بنجاح",
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