import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { respondLegacyEdgeDisabled } from "../_shared/legacy-edge-disabled.ts";

const FUNCTION_PATH = "supabase/functions/send-analysis-email/index.ts";

/**
 * Legacy Edge Function — permanently disabled. Website email dispatch is canonical.
 */
serve(() => {
  return respondLegacyEdgeDisabled({
    success: false,
    blocked: true,
    skipped: true,
    reason: "LEGACY_EDGE_FUNCTION_DISABLED",
    path: FUNCTION_PATH,
    note: "Use website lib/email-dispatch.js instead.",
  });
});
