import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { auditCampaignAction } from "../../../../lib/email-campaign/admin-api.js";
import { createCampaignDraft, listCampaigns } from "../../../../lib/email-campaign/store.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const { searchParams } = new URL(request.url);
    const result = await listCampaigns(admin.supabase, {
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
      status: searchParams.get("status"),
      createdBy: searchParams.get("createdBy"),
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("EMAIL_CAMPAIGNS_LIST_ERROR:", error?.message || error);
    return Response.json({ success: false, error: error?.message || "Failed to list campaigns" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_CREATE, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const body = await request.json();
    const campaign = await createCampaignDraft(admin.supabase, {
      name: body.name,
      subject: body.subject,
      previewText: body.previewText,
      htmlContent: body.htmlContent,
      textContent: body.textContent,
      audienceType: body.audienceType,
      audienceFilter: body.audienceFilter,
      createdBy: admin.user?.id || null,
    });

    await auditCampaignAction(admin.supabase, admin.user, "email.campaign.created", campaign.id, {
      name: campaign.name,
    });

    return Response.json({ success: true, campaign });
  } catch (error) {
    console.error("EMAIL_CAMPAIGNS_CREATE_ERROR:", error?.message || error);
    return Response.json({ success: false, error: error?.message || "Failed to create campaign" }, { status: 500 });
  }
}
