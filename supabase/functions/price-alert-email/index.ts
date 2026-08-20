import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockSupabasePriceAlertEmail } from "../_shared/price-alert-email-guard.ts";
import { respondLegacyEdgeDisabled } from "../_shared/legacy-edge-disabled.ts";

const FUNCTION_PATH = "supabase/functions/price-alert-email/index.ts";

serve(() => {
  const blocked = blockSupabasePriceAlertEmail(FUNCTION_PATH, {
    note: "legacy-edge-function-disabled",
  });

  return respondLegacyEdgeDisabled(blocked);
});
