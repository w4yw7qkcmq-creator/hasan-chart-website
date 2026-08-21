import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { logApiError } from "../../../../lib/structured-logger";
import { verifyTelegramContentWebhookSecret } from "../../../../lib/telegram-content/webhook-verify";
import { TELEGRAM_CONTENT_WEBHOOK_MAX_BODY_BYTES } from "../../../../lib/telegram-content/constants";
import { parseTelegramContentUpdate } from "../../../../lib/telegram-content/update-parser";
import { processTelegramContentUpdate } from "../../../../lib/telegram-content/process-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const route = "/api/webhooks/telegram-content";

  try {
    const secretCheck = verifyTelegramContentWebhookSecret(request);
    if (!secretCheck.ok) {
      return Response.json({ success: false, error: secretCheck.error }, { status: secretCheck.status });
    }

    const rawBodyText = await request.text();
    if (Buffer.byteLength(rawBodyText, "utf8") > TELEGRAM_CONTENT_WEBHOOK_MAX_BODY_BYTES) {
      return Response.json({ success: false, error: "Payload too large." }, { status: 413 });
    }

    let rawBody;
    try {
      rawBody = JSON.parse(rawBodyText);
    } catch {
      return Response.json({ success: false, error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = parseTelegramContentUpdate(rawBody);
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return Response.json({ success: false, error: "Database unavailable." }, { status: 503 });
    }

    const result = await processTelegramContentUpdate(supabase, parsed);

    return Response.json({ success: true, result });
  } catch (error) {
    logApiError({
      route,
      event: "TELEGRAM_CONTENT_WEBHOOK_ERROR",
      error: error?.message || "Unknown error",
      code: error?.code || null,
    });

    return Response.json(
      { success: false, error: "Telegram content webhook processing failed." },
      { status: error?.status || 500 }
    );
  }
}
