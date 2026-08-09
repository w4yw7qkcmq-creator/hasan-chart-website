import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminKeepFraudHold,
  adminListFraudReviewQueue,
  adminReleaseGrowthRewardHold,
} from "../../../../../lib/partner-center/admin-marketing-service.js";
import { isPartnerAdminMarketingEnabled } from "../../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_FRAUD_REVIEW, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    const queue = await adminListFraudReviewQueue(adminCheck.supabase);
    return Response.json({ success: true, ...queue });
  } catch (error) {
    console.error("ADMIN_FRAUD_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل قائمة المراجعة" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_FRAUD_REVIEW, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const { action, entitlementId, reason } = body;
    if (!entitlementId || !reason?.trim()) {
      return Response.json({ success: false, error: "المعرف والسبب مطلوبان" }, { status: 400 });
    }

    if (action === "release") {
      const result = await adminReleaseGrowthRewardHold(adminCheck.supabase, {
        entitlementId,
        reviewerUserId: adminCheck.userId,
        note: reason,
      });
      return Response.json({ success: true, result });
    }

    if (action === "keep_hold") {
      const result = await adminKeepFraudHold(adminCheck.supabase, {
        entitlementId,
        reviewerUserId: adminCheck.userId,
        reason,
      });
      return Response.json({ success: true, result });
    }

    return Response.json({ success: false, error: "إجراء غير مدعوم" }, { status: 400 });
  } catch (error) {
    console.error("ADMIN_FRAUD_POST_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}
