import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { auditCampaignAction } from "../../../../../../lib/email-campaign/admin-api.js";
import { pauseCampaign, resumeCampaign, cancelCampaign } from "../../../../../../lib/email-campaign/processor.js";

export const dynamic = "force-dynamic";

async function handleAction(action, supabase, user, campaignId) {
  if (action === "pause") return pauseCampaign(supabase, campaignId);
  if (action === "resume") return resumeCampaign(supabase, campaignId);
  if (action === "cancel") return cancelCampaign(supabase, campaignId);
  throw new Error("Unknown action");
}

export async function POST(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_SEND, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const body = await request.json();
    const action = String(body.action || "").trim();
    const campaignId = String(params.id || "").trim();

    const campaign = await handleAction(action, admin.supabase, admin.user, campaignId);
    await auditCampaignAction(admin.supabase, admin.user, `email.campaign.${action}`, campaignId, {});

    return Response.json({ success: true, campaign });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Action failed" }, { status: 400 });
  }
}
