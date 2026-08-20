import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockSupabasePriceAlertEmail } from "../_shared/price-alert-email-guard.ts";
import { respondLegacyEdgeDisabled } from "../_shared/legacy-edge-disabled.ts";

const FUNCTION_PATH = "supabase/functions/check-price-alerts/index.ts";

/**
 * Legacy Edge Function — permanently disabled. Railway worker is canonical.
 */
serve(() => {
  const blocked = blockSupabasePriceAlertEmail(FUNCTION_PATH, {
    note: "legacy-edge-check-price-alerts-disabled",
    legacyMarkers: [
      "email-logo.png",
      "Price Alert Triggered",
      "تم تفعيل تنبيه السعر",
      "HasaN CharT Alerts",
      "alerts@hasanchartworld.com",
    ],
  });

  return respondLegacyEdgeDisabled(blocked);
});
