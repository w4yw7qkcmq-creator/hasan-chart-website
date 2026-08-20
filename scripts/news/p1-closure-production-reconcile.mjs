#!/usr/bin/env node
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const { reconcileStaleOpenIncidents } = require("../../worker/lib/news-intelligence/autonomy/incident-recovery.js");
const { reconcileStalePublicationLegs } = require("../../worker/lib/news-intelligence/autonomy/publication-leg-reconciliation.js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

async function loadTargets(supabase) {
  const [incidents, publications] = await Promise.all([
    supabase
      .from("news_incidents")
      .select("incident_id,incident_type,severity,current_state,last_seen_at,signature,evidence_summary")
      .eq("current_state", "open")
      .eq("incident_type", "NEWS_PUBLICATION_PIPELINE_STALL")
      .order("last_seen_at", { ascending: false }),
    supabase
      .from("news_event_publications")
      .select("id,event_key,publication_type,source_type,source_id,telegram_leg_status,site_leg_status,created_at,metadata")
      .or("telegram_leg_status.eq.pending,site_leg_status.eq.pending")
      .order("created_at", { ascending: true }),
  ]);

  if (incidents.error) throw incidents.error;
  if (publications.error) throw publications.error;

  return {
    openStallIncidents: (incidents.data || []).filter((row) => !row.evidence_summary?.canary),
    pendingPublications: publications.data || [],
  };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Missing Supabase credentials in .env.local");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const targets = await loadTargets(supabase);
  console.log(
    "P1_RECONCILE_DIAGNOSTIC",
    JSON.stringify(
      {
        apply: APPLY,
        openStallIncidents: targets.openStallIncidents.map((row) => ({
          incidentId: row.incident_id,
          severity: row.severity,
          lastSeenAt: row.last_seen_at,
          signature: row.signature,
        })),
        pendingPublications: targets.pendingPublications.map((row) => ({
          id: row.id,
          eventKey: row.event_key,
          publicationType: row.publication_type,
          sourceType: row.source_type,
          sourceId: row.source_id,
          createdAt: row.created_at,
          canary: row.metadata?.canary === true || String(row.event_key || "").startsWith("CANARY:"),
          telegramLegStatus: row.telegram_leg_status,
          siteLegStatus: row.site_leg_status,
        })),
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log("P1_RECONCILE_DRY_RUN complete. Re-run with --apply to reconcile.");
    return;
  }

  const [incidents, publications] = await Promise.all([
    reconcileStaleOpenIncidents(supabase, {
      forceResolve: true,
      lastRssPollAt: Date.now(),
      lastTelegramPollAt: Date.now(),
    }),
    reconcileStalePublicationLegs(supabase, { staleAgeMs: 0, limit: 100 }),
  ]);

  console.log(
    "P1_RECONCILE_APPLY_RESULT",
    JSON.stringify(
      {
        incidents,
        publications,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("P1_RECONCILE_FAIL", error);
  process.exit(1);
});
