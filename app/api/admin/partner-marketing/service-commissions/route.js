import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminGetServiceCommissionPolicy,
  adminUpdateServiceCommissionRule,
} from "../../../../../lib/partner-center/service-commission-admin.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_REWARDS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const policy = await adminGetServiceCommissionPolicy(adminCheck.supabase);
    return Response.json({ success: true, policy });
  } catch (error) {
    console.error("ADMIN_SERVICE_COMMISSION_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل سياسة عمولات الخدمات" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_REWARDS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json();
    const serviceType = body?.serviceType;
    if (!serviceType) {
      return Response.json({ success: false, error: "نوع الخدمة مطلوب" }, { status: 400 });
    }

    const created = await adminUpdateServiceCommissionRule(adminCheck.supabase, {
      serviceType,
      isEnabled: body?.isEnabled,
      tierPolicy: body?.tierPolicy,
      commissionPercent: body?.commissionPercent,
      fixedAmount: body?.fixedAmount,
      releasePolicy: body?.releasePolicy,
      actorUserId: adminCheck.user?.id ?? adminCheck.userId ?? null,
      reason: typeof body?.reason === "string" ? body.reason.slice(0, 500) : null,
    });

    return Response.json({
      success: true,
      rule: {
        id: created.id,
        serviceType: created.service_type,
        isEnabled: created.is_enabled,
        tierPolicy: created.tier_policy,
        commissionPercent: Number(created.commission_percent),
        releasePolicy: created.release_policy,
        ruleVersion: created.rule_version,
        effectiveFrom: created.effective_from,
      },
    });
  } catch (error) {
    console.error("ADMIN_SERVICE_COMMISSION_PUT_ERROR", error?.message);
    const status = error?.status || 500;
    return Response.json(
      { success: false, error: "تعذر حفظ قاعدة العمولة", code: error?.message },
      { status }
    );
  }
}
