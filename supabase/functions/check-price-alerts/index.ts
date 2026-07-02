import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockSupabasePriceAlertEmail } from "../_shared/price-alert-email-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_PATH = "supabase/functions/check-price-alerts/index.ts";

/**
 * Legacy Edge Function that previously sent price alert emails via Resend
 * (email-logo.png, "Price Alert Triggered", "تم تفعيل تنبيه ZECUSDT").
 * Disabled permanently — Railway worker/index.js is the sole sender.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const blocked = blockSupabasePriceAlertEmail(FUNCTION_PATH, {
    method: req.method,
    note: "legacy-edge-check-price-alerts-disabled",
    legacyMarkers: [
      "email-logo.png",
      "Price Alert Triggered",
      "تم تفعيل تنبيه السعر",
      "HasaN CharT Alerts",
      "alerts@hasanchartworld.com",
    ],
  });

  return new Response(JSON.stringify(blocked), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
