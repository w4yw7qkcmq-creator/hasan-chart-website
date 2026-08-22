import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { auditCampaignAction, sendCampaignTestEmail } from "../../../../../../lib/email-campaign/admin-api.js";
import { getCampaignById } from "../../../../../../lib/email-campaign/store.js";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_SEND, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const body = await request.json();
    const recipientEmail = String(body.recipientEmail || "").trim();
    if (!recipientEmail) {
      return Response.json({ success: false, error: "recipientEmail is required" }, { status: 400 });
    }

    const campaign = await getCampaignById(admin.supabase, String(params.id));
    if (!campaign) {
      return Response.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    const result = await sendCampaignTestEmail(admin.supabase, campaign, {
      recipientEmail,
      adminId: admin.user?.id || null,
    });

    await auditCampaignAction(admin.supabase, admin.user, "email.campaign.test_sent", campaign.id, {
      recipientEmail,
      outboxId: result.record?.id || null,
    });

    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Test send failed", code: error.code || null },
      { status: error.code === "CAMPAIGN_TEST_RECIPIENT_INELIGIBLE" ? 400 : 500 }
    );
  }
}
