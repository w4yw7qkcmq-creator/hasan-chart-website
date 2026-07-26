import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { recordResendWebhookEvent } from "../../../../lib/email-analytics-store";
import { verifyResendWebhook } from "../../../../lib/resend-webhook";
import { logApiError, logApiWarning } from "../../../../lib/structured-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const payload = await request.text();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();

    if (!webhookSecret) {
      if (process.env.NODE_ENV === "production") {
        return Response.json(
          { success: false, error: "Webhook verification is not configured." },
          { status: 503 }
        );
      }

      console.warn("RESEND_WEBHOOK_SECRET missing — accepting webhook without signature verification");
      const event = JSON.parse(payload);
      const supabase = getSupabaseAdmin();
      await recordResendWebhookEvent(supabase, event);
      return Response.json({ success: true });
    }

    const event = verifyResendWebhook(payload, request.headers, webhookSecret);

    const supabase = getSupabaseAdmin();
    const eventType = String(event?.type || "").trim();

    if (eventType === "email.opened" || eventType === "email.clicked") {
      const data = event?.data || {};
      logApiWarning({
        route: "/api/webhooks/resend",
        event: "RESEND_WEBHOOK_ENGAGEMENT",
        type: eventType,
        emailId: data.email_id || data.id || null,
        recipient: Array.isArray(data.to) ? data.to[0] : data.to || null,
        subject: data.subject || null,
        clickLink: data.click?.link || null,
        createdAt: event.created_at || data.created_at || null,
      });
    }

    await recordResendWebhookEvent(supabase, event);

    return Response.json({ success: true });
  } catch (error) {
    logApiError({
      route: "/api/webhooks/resend",
      method: "POST",
      error: error?.message || String(error),
    });
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
