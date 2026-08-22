import { verifyAdminOrCronSecret } from "../../../../lib/admin-auth";
import { runCampaignProcessorCycle } from "../../../../lib/email-campaign/processor.js";
import { getSupabaseAdmin } from "../../../../lib/auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const auth = await verifyAdminOrCronSecret(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status || 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const result = await runCampaignProcessorCycle(supabase, {
      batchSize: Number(process.env.EMAIL_CAMPAIGN_BATCH_SIZE || 50),
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("EMAIL_CAMPAIGN_CRON_ERROR:", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Campaign processor failed" },
      { status: 500 }
    );
  }
}
