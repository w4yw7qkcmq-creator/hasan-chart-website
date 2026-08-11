import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminCreateCampaign,
  adminCreateCampaignVersion,
  adminCreateCampaignWithMissions,
  adminCampaignAction,
  adminSetCampaignStatus,
  adminUpdateCampaign,
  enrichCampaignsForAdmin,
  resolveCampaignDashboardBucket,
} from "../../../../../lib/partner-center/admin-marketing-service.js";
import { isPartnerAdminMarketingEnabled } from "../../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

function gateDisabled() {
  return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
}

export async function GET(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) return gateDisabled();
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_CAMPAIGNS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const bucketFilter = searchParams.get("bucket");
    const withMetrics = searchParams.get("metrics") !== "0";

    let query = adminCheck.supabase
      .from("partner_campaign_programs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    let campaigns = data || [];
    if (bucketFilter) {
      campaigns = campaigns.filter((c) => resolveCampaignDashboardBucket(c) === bucketFilter);
    }

    if (withMetrics) {
      campaigns = await enrichCampaignsForAdmin(adminCheck.supabase, campaigns);
    }

    return Response.json({ success: true, campaigns });
  } catch (error) {
    console.error("ADMIN_CAMPAIGNS_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل الحملات" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) return gateDisabled();
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_CAMPAIGNS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    if (body.wizard === true || Array.isArray(body.missions)) {
      const result = await adminCreateCampaignWithMissions(adminCheck.supabase, body, adminCheck.userId);
      return Response.json({ success: true, ...result });
    }
    const campaign = await adminCreateCampaign(adminCheck.supabase, body, adminCheck.userId);
    return Response.json({ success: true, campaign });
  } catch (error) {
    console.error("ADMIN_CAMPAIGNS_POST_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر إنشاء الحملة" }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) return gateDisabled();
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_CAMPAIGNS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    if (!body.id) {
      return Response.json({ success: false, error: "معرف الحملة مطلوب" }, { status: 400 });
    }

    const { id, action, status, reason, expected_updated_at, ...patch } = body;
    let campaign;

    const lifecycleActions = ["schedule", "activate", "pause", "resume", "complete", "cancel", "delete_draft"];
    if (action && lifecycleActions.includes(action)) {
      campaign = await adminCampaignAction(adminCheck.supabase, id, action, adminCheck.userId, {
        expected_updated_at,
        reason,
        patch,
      });
      if (campaign?.deleted) {
        return Response.json({ success: true, deleted: true, id: campaign.id });
      }
    } else if (action === "create_version") {
      campaign = await adminCreateCampaignVersion(adminCheck.supabase, id, patch, adminCheck.userId);
    } else if (status != null) {
      campaign = await adminSetCampaignStatus(adminCheck.supabase, id, status, adminCheck.userId, { reason });
    } else {
      if (expected_updated_at) {
        const { data: before } = await adminCheck.supabase
          .from("partner_campaign_programs")
          .select("updated_at")
          .eq("id", id)
          .single();
        const expected = new Date(expected_updated_at).toISOString();
        const actual = new Date(before?.updated_at).toISOString();
        if (before?.updated_at && expected !== actual) {
          return Response.json({ success: false, error: "conflict_updated_at" }, { status: 409 });
        }
      }
      campaign = await adminUpdateCampaign(adminCheck.supabase, id, patch, adminCheck.userId);
    }
    return Response.json({ success: true, campaign });
  } catch (error) {
    console.error("ADMIN_CAMPAIGNS_PATCH_ERROR");
    const status = error.code === "CONFLICT" || error.message === "conflict_updated_at" ? 409 : 500;
    return Response.json({ success: false, error: error.message || "تعذر تحديث الحملة" }, { status });
  }
}
