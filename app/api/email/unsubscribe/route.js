import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { verifyEmailUnsubscribeToken } from "../../../../lib/email-campaign/unsubscribe-token.js";
import { upsertMarketingPreferences } from "../../../../lib/email-marketing-preferences.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  const verified = verifyEmailUnsubscribeToken(token);

  if (!verified.valid) {
    return Response.json({ success: false, error: "Invalid or expired link" }, { status: 400 });
  }

  return Response.json({ success: true, status: "ready" });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    const verified = verifyEmailUnsubscribeToken(token);

    if (!verified.valid) {
      return Response.json({ success: false, error: "Invalid or expired link" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    await upsertMarketingPreferences(supabase, {
      userId: verified.userId,
      marketingOptIn: false,
      source: verified.campaignId ? `campaign:${verified.campaignId}` : "unsubscribe-link",
    });

    return Response.json({ success: true, message: "Unsubscribed successfully" });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Unsubscribe failed" }, { status: 500 });
  }
}
