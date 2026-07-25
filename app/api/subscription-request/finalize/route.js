import { NextResponse } from "next/server";
import { requireSessionUser, getSupabaseAdmin } from "../../../../lib/auth-session.js";
import { getSiteUrl, buildEmailLayout } from "../../../../lib/email";
import { buildAdminSubscriptionRequestEmailContent } from "../../../../lib/email-layout.js";
import { dispatchTransactionalEmail } from "../../../../lib/email-dispatch.js";
import { dispatchAdminSiteNotification } from "../../../../lib/site-notification-dispatch.js";
import {
  assertPaymentProofStorageReady,
  paymentProofStorageUnavailableMessage,
} from "../../../../lib/payment-proof-storage.js";
import { finalizePaymentProofUpload } from "../../../../lib/payment-proof-subscription-flow.js";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_REPLY_TO || "support@hasanchartworld.com";

async function sendAdminSubscriptionRequestEmail({
  subscriptionRequestId,
  userEmail,
  username,
  planName,
  category,
  price,
  telegramUsername,
}) {
  const title = "طلب اشتراك جديد 💳";
  const content = buildAdminSubscriptionRequestEmailContent({
    planName,
    category,
    price,
    userEmail,
    username,
    telegramUsername,
    paymentProofHtml: "تم حفظ إثبات الدفع في التخزين الآمن ويمكن عرضه من لوحة الإدارة.",
  });

  return dispatchTransactionalEmail({
    idempotencyKey: `admin_sub_req:${subscriptionRequestId}`,
    recipientEmail: ADMIN_EMAIL,
    subject: "طلب اشتراك جديد - HasaN CharT World",
    html: buildEmailLayout({
      title,
      content,
      actionText: "فتح لوحة الإدارة",
      actionUrl: `${getSiteUrl()}/admin`,
    }),
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
        { success: false, error: "يجب تسجيل الدخول أولاً.", errorCode: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    try {
      assertPaymentProofStorageReady();
    } catch (storageError) {
      return NextResponse.json(
        {
          success: false,
          error: paymentProofStorageUnavailableMessage(),
          errorCode: storageError.code,
        },
        { status: storageError.status || 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = body.sessionId || body.session_id;
    const objectPath = String(body.objectPath || body.object_path || "").trim();
    const declaredMime = String(body.mimeType || body.mime_type || "").trim() || null;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "معرف جلسة الرفع مطلوب", errorCode: "MISSING_SESSION_ID" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { request: finalizedRequest, duplicate, sessionId: resolvedSessionId } =
      await finalizePaymentProofUpload(supabase, {
        userId: session.id,
        userEmail: session.email,
        sessionId,
        objectPath,
        declaredMime,
      });

    if (!duplicate) {
      try {
        await dispatchAdminSiteNotification(supabase, {
          preset: "subscription_request",
          title: "طلب اشتراك جديد 💳",
          message: `طلب اشتراك جديد في ${finalizedRequest.plan_name} (${finalizedRequest.category}) من ${session.email}.`,
          metadata: {
            planName: finalizedRequest.plan_name,
            category: finalizedRequest.category,
            userEmail: session.email,
            username: finalizedRequest.username,
          },
        });
      } catch (notificationError) {
        console.error(
          "Admin subscription notification error:",
          notificationError?.message || notificationError
        );
      }

      try {
        await sendAdminSubscriptionRequestEmail({
          subscriptionRequestId: finalizedRequest.id,
          userEmail: session.email,
          username: finalizedRequest.username,
          planName: finalizedRequest.plan_name,
          category: finalizedRequest.category,
          price: finalizedRequest.price,
          telegramUsername: finalizedRequest.telegram_username,
        });
      } catch (emailError) {
        console.error("Admin subscription email error:", emailError?.message || emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "تم إرسال طلب الاشتراك بنجاح",
      requestId: finalizedRequest.id,
      sessionId: resolvedSessionId,
      duplicate: Boolean(duplicate),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
        errorCode: error?.code || "UPLOAD_FINALIZE_FAILED",
      },
      { status: error?.status || 500 }
    );
  }
}
