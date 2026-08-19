#!/usr/bin/env node
/**
 * Read-only Production audit: would forward-only milestone logic trigger retroactive grants?
 */
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import {
  computeMilestoneMetricValue,
  resolveMilestoneMetricWindow,
} from "../../lib/partner-center/partner-metrics.js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const ref = new URL(url).hostname.split(".")[0];
if (ref !== PRODUCTION_SUPABASE_PROJECT_REF) {
  console.error(`Refusing audit: expected production ref ${PRODUCTION_SUPABASE_PROJECT_REF}, got ${ref}`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: milestones, error: msErr } = await supabase
  .from("partner_milestone_definitions")
  .select("id, code, metric, threshold_value, effective_from, effective_to, created_at, status")
  .eq("status", "active");
if (msErr) throw msErr;

const { data: partners, error: pErr } = await supabase.from("partners").select("id, tier_key").eq("status", "active");
if (pErr) throw pErr;

const { data: grants, error: gErr } = await supabase
  .from("partner_milestone_grants")
  .select("partner_id, milestone_id");
if (gErr) throw gErr;

const grantSet = new Set((grants || []).map((g) => `${g.partner_id}:${g.milestone_id}`));

let retroactiveWouldTrigger = 0;
const affected = [];

for (const milestone of milestones || []) {
  const window = resolveMilestoneMetricWindow(milestone);
  for (const partner of partners || []) {
    const grantKey = `${partner.id}:${milestone.id}`;
    if (grantSet.has(grantKey)) continue;

    const windowValue = await computeMilestoneMetricValue(
      supabase,
      partner.id,
      milestone.metric,
      window
    );
    if (windowValue < Number(milestone.threshold_value)) continue;

    retroactiveWouldTrigger += 1;
    affected.push({
      milestoneCode: milestone.code,
      partnerIdSuffix: String(partner.id).slice(-6),
    });
  }
}

console.log(
  JSON.stringify(
    {
      auditedAt: new Date().toISOString(),
      activeMilestones: (milestones || []).length,
      activePartners: (partners || []).length,
      existingGrants: (grants || []).length,
      RETROACTIVE_GRANTS_WOULD_TRIGGER: retroactiveWouldTrigger,
      affectedCount: affected.length,
      sampleAffected: affected.slice(0, 10),
    },
    null,
    2
  )
);

process.exit(retroactiveWouldTrigger > 0 ? 2 : 0);
