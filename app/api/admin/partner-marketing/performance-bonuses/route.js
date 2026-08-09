import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminCreatePerformanceBonusRule,
  adminListPerformanceBonusRules,
  adminUpdatePerformanceBonusRule,
} from "../../../../../lib/partner-center/admin-marketing-service.js";
import { isPartnerAdminMarketingEnabled } from "../../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_MISSIONS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    const rules = await adminListPerformanceBonusRules(adminCheck.supabase);
    return Response.json({ success: true, rules });
  } catch (error) {
    console.error("ADMIN_BONUS_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل قواعد المكافآت" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_MISSIONS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    const body = await request.json().catch(() => ({}));
    const rule = await adminCreatePerformanceBonusRule(adminCheck.supabase, body, adminCheck.userId);
    return Response.json({ success: true, rule });
  } catch (error) {
    console.error("ADMIN_BONUS_POST_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر إنشاء القاعدة" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_MISSIONS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    const body = await request.json().catch(() => ({}));
    if (!body.id) {
      return Response.json({ success: false, error: "معرف القاعدة مطلوب" }, { status: 400 });
    }
    const { id, ...patch } = body;
    const rule = await adminUpdatePerformanceBonusRule(adminCheck.supabase, id, patch, adminCheck.userId);
    return Response.json({ success: true, rule });
  } catch (error) {
    console.error("ADMIN_BONUS_PATCH_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر تحديث القاعدة" }, { status: 500 });
  }
}
