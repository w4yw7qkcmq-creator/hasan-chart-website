import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockSupabasePriceAlertEmail } from "../_shared/price-alert-email-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const FUNCTION_PATH = "supabase/functions/price-alert-email/index.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));

  const blocked = blockSupabasePriceAlertEmail(FUNCTION_PATH, {
    method: req.method,
    email: body?.email || body?.to || null,
    coin: body?.coin || null,
    alertId: body?.alertId || body?.alert_id || null,
    note: "legacy-edge-function-disabled",
  });

  return new Response(JSON.stringify(blocked), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
