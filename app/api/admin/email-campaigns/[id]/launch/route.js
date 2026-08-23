import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { auditCampaignAction } from "../../../../../../lib/email-campaign/admin-api.js";
import { launchCampaignSending } from "../../../../../../lib/email-campaign/processor.js";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_SEND, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const body = await request.json().catch(() => ({}));
    if (body.confirm !== true) {
      return Response.json(
        { success: false, error: "Explicit confirmation required (confirm: true)" },
        { status: 400 }
      );
    }

    const result = await launchCampaignSending(admin.supabase, String(params.id));

    await auditCampaignAction(admin.supabase, admin.user, "email.campaign.launched", String(params.id), result);

    return Response.json({
      success: true,
      ...result,
      campaign: result.campaign
        ? {
            id: result.campaign.id,
            name: result.campaign.name,
            status: result.campaign.status,
            eligible_count: result.campaign.eligible_count,
            queued_count: result.campaign.queued_count,
            delivered_count: result.campaign.delivered_count,
            failed_count: result.campaign.failed_count,
          }
        : null,
    });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Launch failed" }, { status: 400 });
  }
}
