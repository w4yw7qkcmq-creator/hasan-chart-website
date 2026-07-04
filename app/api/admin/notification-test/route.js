import { verifyAdminSession } from "../../../../lib/admin-auth";
import {
  ADMIN_NOTIFICATION_TEST_TYPES,
  runAdminNotificationTest,
} from "../../../../lib/admin-notification-test-center.js";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import { adminMutationLimiter } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_TYPES = new Set(ADMIN_NOTIFICATION_TEST_TYPES.map((item) => item.id));

export async function GET() {
  const adminCheck = await verifyAdminSession();

  if (!adminCheck.ok) {
    return Response.json(
      { success: false, error: adminCheck.error },
      { status: adminCheck.status }
    );
  }

  return Response.json({
    success: true,
    types: ADMIN_NOTIFICATION_TEST_TYPES,
    defaultRecipient: String(adminCheck.user?.email || "").trim().toLowerCase(),
  });
}

export async function POST(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );

    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => null);
    const type = String(body?.type || "").trim();
    const targetEmail = String(body?.targetEmail || adminCheck.user?.email || "")
      .trim()
      .toLowerCase();

    if (!ALLOWED_TYPES.has(type)) {
      return Response.json(
        { success: false, error: "نوع الإشعار غير مدعوم للاختبار." },
        { status: 400 }
      );
    }

    if (!targetEmail) {
      return Response.json(
        { success: false, error: "بريد المستلم مطلوب." },
        { status: 400 }
      );
    }

    const result = await runAdminNotificationTest(adminCheck.supabase, {
      type,
      targetEmail,
    });

    return Response.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("ADMIN_NOTIFICATION_TEST_ERROR", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر تنفيذ اختبار الإشعار.",
      },
      { status: 500 }
    );
  }
}
