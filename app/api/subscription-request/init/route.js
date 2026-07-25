import { NextResponse } from "next/server";
import { requireSessionUser, getSupabaseAdmin } from "../../../../lib/auth-session.js";
import {
  RATE_LIMIT_ERROR,
  subscriptionRequestLimiter,
} from "../../../../lib/rate-limit";
import {
  assertPaymentProofStorageReady,
  paymentProofStorageUnavailableMessage,
} from "../../../../lib/payment-proof-storage.js";
import { initUploadSession } from "../../../../lib/payment-proof-subscription-flow.js";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { success: false, error: "يجب تسجيل الدخول أولاً.", errorCode: "UNAUTHORIZED" },
    { status: 401 }
  );
}

export async function POST(request) {
  try {
    const session = await requireSessionUser();
    if (session.error) return unauthorized();

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

    const rateLimitResult = await subscriptionRequestLimiter(session.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: RATE_LIMIT_ERROR, errorCode: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const planName = String(body.plan_name || "").trim();
    const category = String(body.category || "").trim();
    const price = String(body.price || "").trim();
    const telegramUsername = String(body.telegram_username || "").trim().slice(0, 64);

    if (!planName || !category || !price || !telegramUsername) {
      return NextResponse.json(
        {
          success: false,
          error: "بيانات طلب الاشتراك غير مكتملة",
          errorCode: "INCOMPLETE_SUBSCRIPTION_DATA",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { session: uploadSession } = await initUploadSession(supabase, {
      userId: session.id,
      userEmail: session.email,
      username: String(body.username || session.username || session.email).trim(),
      planName,
      category,
      price,
      telegramUsername,
    });

    return NextResponse.json({
      success: true,
      sessionId: uploadSession.id,
      status: uploadSession.status,
      expiresAt: uploadSession.expires_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
        errorCode: error?.code || "UPLOAD_SESSION_INIT_FAILED",
      },
      { status: error?.status || 500 }
    );
  }
}
