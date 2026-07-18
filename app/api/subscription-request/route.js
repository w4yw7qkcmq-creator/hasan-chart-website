import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSessionUser } from "../../../lib/auth-session";
import {
  RATE_LIMIT_ERROR,
  subscriptionRequestLimiter,
} from "../../../lib/rate-limit";
import { getSiteUrl, buildEmailLayout } from "../../../lib/email";
import { buildAdminSubscriptionRequestEmailContent } from "../../../lib/email-layout.js";
import { dispatchTransactionalEmail } from "../../../lib/email-dispatch.js";
import { dispatchAdminSiteNotification } from "../../../lib/site-notification-dispatch.js";

const MAX_PAYMENT_PROOF_DATA_URL_BYTES = 6 * 1024 * 1024;

function validateDataUrlImage(dataUrl) {
  const raw = String(dataUrl || "").trim();

  if (!raw) {
    return { ok: false, code: "EMPTY_UPLOAD" };
  }

  if (/[<>`]/.test(raw) || /^javascript:/i.test(raw)) {
    return { ok: false, code: "INVALID_UPLOAD_FORMAT" };
  }

  const match = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);

  if (!match) {
    return { ok: false, code: "INVALID_UPLOAD_FORMAT" };
  }

  const base64 = match[2].replace(/\s/g, "");
  const approxBytes = Math.ceil((base64.length * 3) / 4);

  if (approxBytes > MAX_PAYMENT_PROOF_DATA_URL_BYTES) {
    return { ok: false, code: "UPLOAD_TOO_LARGE" };
  }

  return { ok: true };
}

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

async function sendAdminSubscriptionRequestEmail({
  subscriptionRequestId,
  userEmail,
  username,
  planName,
  category,
  price,
  telegramUsername,
  paymentProof,
}) {
  if (!subscriptionRequestId) {
    throw new Error("subscriptionRequestId is required");
  }

  const isInlinePaymentProof = String(paymentProof || "").startsWith("data:image");
  const paymentProofHtml = isInlinePaymentProof
    ? "صورة إثبات الدفع محفوظة داخل الطلب ويمكن عرضها من لوحة الإدارة."
    : paymentProof
    ? `<a href="${paymentProof}" style="color:#67e8f9;font-weight:800;text-decoration:none">فتح صورة إثبات الدفع</a>`
    : "غير مرفق";

  const title = "طلب اشتراك جديد 💳";
  const content = buildAdminSubscriptionRequestEmailContent({
    planName,
    category,
    price,
    userEmail,
    username,
    telegramUsername,
    paymentProofHtml,
  });
  const actionText = "فتح لوحة الإدارة";
  const actionUrl = `${getSiteUrl()}/admin`;

  return dispatchTransactionalEmail({
    idempotencyKey: `admin_sub_req:${subscriptionRequestId}`,
    recipientEmail: ADMIN_EMAIL,
    subject: "طلب اشتراك جديد - HasaN CharT World",
    html: buildEmailLayout({ title, content, actionText, actionUrl }),
    messageType: "admin_subscription_request",
    recordId: subscriptionRequestId,
    metadata: {
      source: "subscription_request",
      subscriptionRequestId,
      userEmail,
      category,
      planName,
    },
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
    const telegramUsername = String(body.telegram_username || "").trim().slice(0, 64);
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

    const paymentProofCheck = validateDataUrlImage(paymentProof);

    if (!paymentProofCheck.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            paymentProofCheck.code === "UPLOAD_TOO_LARGE"
              ? "حجم إثبات الدفع كبير جداً"
              : "صيغة إثبات الدفع غير صالحة",
        },
        { status: 400 }
      );
    }

    const { data: insertedRequest, error } = await supabase
      .from("subscription_requests")
      .insert([
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
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: "تعذر إرسال طلب الاشتراك حالياً",
        },
        { status: 500 }
      );
    }

    try {
      await dispatchAdminSiteNotification(supabase, {
        preset: "subscription_request",
        title: "طلب اشتراك جديد 💳",
        message: `طلب اشتراك جديد في ${planName} (${category}) من ${userEmail}.`,
        metadata: {
          planName,
          category,
          userEmail,
          username,
        },
      });
    } catch (notificationError) {
      console.error("Admin subscription notification error:", notificationError?.message || notificationError);
    }

    try {
      const emailResult = await sendAdminSubscriptionRequestEmail({
        subscriptionRequestId: insertedRequest.id,
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