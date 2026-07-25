import { NextResponse } from "next/server";
import { requireSessionUser, getSupabaseAdmin } from "../../../../lib/auth-session.js";
import {
  assertPaymentProofStorageReady,
  paymentProofStorageUnavailableMessage,
} from "../../../../lib/payment-proof-storage.js";
import { validateAllowedImageMimeType } from "../../../../lib/upload-validation.js";
import { authorizePaymentProofUpload } from "../../../../lib/payment-proof-subscription-flow.js";

export const dynamic = "force-dynamic";

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
    const declaredMime = String(body.mimeType || body.mime_type || "")
      .trim()
      .toLowerCase()
      .replace("image/jpg", "image/jpeg");
    const declaredSize = Number(body.sizeBytes || body.size || 0);

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "معرف جلسة الرفع مطلوب", errorCode: "MISSING_SESSION_ID" },
        { status: 400 }
      );
    }

    if (!validateAllowedImageMimeType(declaredMime)) {
      return NextResponse.json(
        { success: false, error: "صيغة إثبات الدفع غير مدعومة", errorCode: "INVALID_UPLOAD_MIME" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const authorization = await authorizePaymentProofUpload(supabase, {
      userId: session.id,
      userEmail: session.email,
      sessionId,
      declaredMime,
      declaredSize,
    });

    return NextResponse.json({
      success: true,
      sessionId: authorization.sessionId,
      objectPath: authorization.objectPath,
      signedUrl: authorization.upload.signedUrl,
      token: authorization.upload.token,
      expiresIn: authorization.upload.expiresIn,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
        errorCode: error?.code || "UPLOAD_AUTHORIZE_FAILED",
      },
      { status: error?.status || 500 }
    );
  }
}
