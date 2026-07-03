import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildAnalysisReplyEmailHtml } from "../_shared/email-layout.ts";
import {
  isSupabasePriceAlertEmailRequest,
} from "../_shared/price-alert-email-guard.ts";
import {
  rejectSupabasePriceAlertRequest,
  sendSupabaseResendEmail,
} from "../_shared/resend-edge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const ADMIN_EMAIL_SECRET = Deno.env.get("ADMIN_EMAIL_SECRET") || "";
const FUNCTION_PATH = "supabase/functions/send-analysis-email/index.ts";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const providedSecret = req.headers.get("x-admin-secret") || "";

    if (!ADMIN_EMAIL_SECRET || providedSecret !== ADMIN_EMAIL_SECRET) {
      return jsonResponse({ error: "Unauthorized email request" }, 401);
    }

    const body = await req.json().catch(() => ({}));

    if (isSupabasePriceAlertEmailRequest(body)) {
      return jsonResponse(
        rejectSupabasePriceAlertRequest(FUNCTION_PATH, body),
        410
      );
    }

    const { email, coin, reply } = body as Record<string, unknown>;

    if (!email || !coin || !reply) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const replyText = String(reply || "").trim();
    if (replyText.length < 2) {
      return jsonResponse({ error: "Analysis reply content is required" }, 400);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      return jsonResponse({ error: "Missing RESEND_API_KEY" }, 500);
    }

    const subject = `📩 تم الرد على تحليل ${String(coin)}`;

    const resendPayload = {
      from: "HasaN CharT World <alerts@hasanchartworld.com>",
      to: email,
      subject,
      html: buildAnalysisReplyEmailHtml({
        coin: String(coin),
        reply: replyText,
      }),
    };

    const outcome = await sendSupabaseResendEmail({
      path: `${FUNCTION_PATH}::send`,
      resendApiKey: RESEND_API_KEY,
      payload: resendPayload,
    });

    if (outcome.blocked) {
      return jsonResponse(outcome, 410);
    }

    if (!outcome.success) {
      return jsonResponse(
        {
          error: outcome.error || "Email provider error",
          data: outcome.data || null,
        },
        outcome.status || 500
      );
    }

    return jsonResponse(outcome.data || { success: true }, outcome.status || 200);
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error) }, 500);
  }
});
