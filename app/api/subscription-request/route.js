import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/auth-session";
import {
  RATE_LIMIT_ERROR,
  subscriptionRequestLimiter,
} from "../../../lib/rate-limit";
import {
  assertPaymentProofStorageReady,
  paymentProofStorageUnavailableMessage,
} from "../../../lib/payment-proof-storage.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return NextResponse.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً.",
          errorCode: "UNAUTHORIZED",
        },
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
          code: storageError.code,
          errorCode: storageError.code,
        },
        { status: storageError.status || 503 }
      );
    }

    const rateLimitResult = await subscriptionRequestLimiter(session.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: RATE_LIMIT_ERROR,
          errorCode: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body.payment_proof || body.paymentProof) {
      return NextResponse.json(
        {
          success: false,
          error:
            "تم إيقاف رفع إثبات الدفع بصيغة Base64. استخدم مسار الرفع الآمن: init → upload-authorize → finalize.",
          code: "PAYMENT_PROOF_BASE64_DISABLED",
          errorCode: "PAYMENT_PROOF_BASE64_DISABLED",
        },
        { status: 410 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "استخدم /api/subscription-request/init ثم upload-authorize ثم finalize لإرسال طلب اشتراك جديد.",
        code: "PAYMENT_PROOF_STORAGE_REQUIRED",
        errorCode: "PAYMENT_PROOF_STORAGE_REQUIRED",
      },
      { status: 400 }
    );
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
