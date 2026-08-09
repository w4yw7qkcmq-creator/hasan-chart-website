import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminCreateMission,
  adminCreateMissionVersion,
  adminSetMissionStatus,
  adminUpdateMission,
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

    const { data, error } = await adminCheck.supabase
      .from("partner_mission_definitions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return Response.json({ success: true, missions: data || [] });
  } catch (error) {
    console.error("ADMIN_MISSIONS_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل المهام" }, { status: 500 });
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
    const mission = await adminCreateMission(adminCheck.supabase, body, adminCheck.userId);
    return Response.json({ success: true, mission });
  } catch (error) {
    console.error("ADMIN_MISSIONS_POST_ERROR");
    return Response.json(
      { success: false, error: error.message || "تعذر إنشاء المهمة", code: error.code },
      { status: error.code === "VALIDATION" || error.code === "MISSION_TYPE_UNSUPPORTED" ? 400 : 500 }
    );
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
      return Response.json({ success: false, error: "معرف المهمة مطلوب" }, { status: 400 });
    }

    const { id, action, status, reason, ...patch } = body;
    let mission;
    if (action === "create_version") {
      mission = await adminCreateMissionVersion(adminCheck.supabase, id, patch, adminCheck.userId);
    } else if (status != null) {
      mission = await adminSetMissionStatus(adminCheck.supabase, id, status, adminCheck.userId, { reason });
    } else {
      mission = await adminUpdateMission(adminCheck.supabase, id, patch, adminCheck.userId);
    }
    return Response.json({ success: true, mission });
  } catch (error) {
    console.error("ADMIN_MISSIONS_PATCH_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر تحديث المهمة" }, { status: 500 });
  }
}
