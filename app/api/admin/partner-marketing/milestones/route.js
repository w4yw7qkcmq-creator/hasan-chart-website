import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminCreateMilestone,
  adminListMilestones,
  adminSetMilestoneStatus,
  adminUpdateMilestone,
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
    const milestones = await adminListMilestones(adminCheck.supabase);
    return Response.json({ success: true, milestones });
  } catch (error) {
    console.error("ADMIN_MILESTONES_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل المعالم" }, { status: 500 });
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
    const milestone = await adminCreateMilestone(adminCheck.supabase, body, adminCheck.userId);
    return Response.json({ success: true, milestone });
  } catch (error) {
    console.error("ADMIN_MILESTONES_POST_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر إنشاء المعلم" }, { status: 500 });
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
      return Response.json({ success: false, error: "معرف المعلم مطلوب" }, { status: 400 });
    }
    const { id, status, ...patch } = body;
    const milestone =
      status != null
        ? await adminSetMilestoneStatus(adminCheck.supabase, id, status, adminCheck.userId)
        : await adminUpdateMilestone(adminCheck.supabase, id, patch, adminCheck.userId);
    return Response.json({ success: true, milestone });
  } catch (error) {
    console.error("ADMIN_MILESTONES_PATCH_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر تحديث المعلم" }, { status: 500 });
  }
}
