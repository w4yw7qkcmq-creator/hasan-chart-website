#!/usr/bin/env node
/**
 * Production read-only historical site parity classifier.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertProductionSupabaseConfig,
  extractSupabaseProjectRef,
  maskProjectRef,
} from "../../lib/production-env-guard.js";

const require = createRequire(import.meta.url);
const { auditHistoricalMissingSitePosts } = require("../../worker/lib/news-site-recovery.js");

const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "scripts/news/.artifacts");

function parseEnvFile(path) {
  try {
    const fs = require("node:fs");
    if (!fs.existsSync(path)) return {};
    const out = {};
    for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function main() {
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  assertProductionSupabaseConfig({
    projectRef: extractSupabaseProjectRef(local.NEXT_PUBLIC_SUPABASE_URL || ""),
    url: local.NEXT_PUBLIC_SUPABASE_URL,
  });

  const sb = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const report = await auditHistoricalMissingSitePosts(() => sb);
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  const artifactPath = join(ARTIFACT_DIR, `news-worker-historical-132-${timestamp}.json`);
  const payload = {
    timestamp,
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    ...report,
  };
  writeFileSync(artifactPath, JSON.stringify(payload, null, 2));

  console.log(JSON.stringify({ ok: report.ok, artifact: artifactPath, ...report }, null, 2));
  if (!report.ok || report.unknownCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
