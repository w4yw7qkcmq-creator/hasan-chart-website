import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { recordResendWebhookEvent } from "../../../../lib/email-analytics-store";
import { verifyResendWebhook } from "../../../../lib/resend-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const payload = await request.text();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();

    let event;

    if (webhookSecret) {
      event = verifyResendWebhook(payload, request.headers, webhookSecret);
    } else {
      console.warn("RESEND_WEBHOOK_SECRET missing — accepting webhook without signature verification");
      event = JSON.parse(payload);
    }

    const supabase = getSupabaseAdmin();
    const eventType = String(event?.type || "").trim();

    if (eventType === "email.opened" || eventType === "email.clicked") {
      const data = event?.data || {};
      console.log("RESEND_WEBHOOK_ENGAGEMENT", {
        type: eventType,
        emailId: data.email_id || data.id || null,
        recipient: Array.isArray(data.to) ? data.to[0] : data.to || null,
        subject: data.subject || null,
        clickLink: data.click?.link || null,
        clickIp: data.click?.ipAddress || null,
        clickUserAgent: data.click?.userAgent || null,
        createdAt: event.created_at || data.created_at || null,
      });
    }

    await recordResendWebhookEvent(supabase, event);

    return Response.json({ success: true });
  } catch (error) {
    console.error("RESEND_WEBHOOK_ERROR:", error?.message || error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Webhook processing failed",
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  return Response.json({
    success: true,
    message: "Resend webhook endpoint is active. Configure POST events in Resend dashboard.",
    events: [
      "email.sent",
      "email.delivered",
      "email.opened",
      "email.clicked",
      "email.failed",
      "email.bounced",
      "email.complained",
    ],
  });
}
