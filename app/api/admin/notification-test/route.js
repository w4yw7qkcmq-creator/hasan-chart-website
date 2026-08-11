import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import {
  ADMIN_NOTIFICATION_TEST_TYPES,
  runAdminNotificationTest,
} from "../../../../lib/admin-notification-test-center.js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_TYPES = new Set(ADMIN_NOTIFICATION_TEST_TYPES.map((item) => item.id));

export async function GET(request) {
  const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.SYSTEM_NOTIFICATIONS_TEST, { request });

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
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.SYSTEM_NOTIFICATIONS_TEST, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

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
