#!/usr/bin/env node
/**
 * Production audit — News Worker (read-only, masked output).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertProductionSupabaseConfig,
} from "../../lib/production-env-guard.js";

const {
  validateNewsWorkerEnvironment,
  classifyNewsWorkerVariable,
} = require("../../worker/news/news-worker-env.js");

const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "scripts/news/.artifacts");
const NEWS_SERVICE = process.env.NEWS_WORKER_RAILWAY_SERVICE || "2f2f4f78-36f3-4a19-a2ff-0832e3c710b9";

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

function railwayVars(service) {
  const r = spawnSync("npx", ["@railway/cli", "variables", "--json", "--service", service], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout);
}

function auditVariables(vars) {
  return Object.keys(vars || {})
    .sort()
    .map((key) => ({
      variable: key,
      present: true,
      nonEmpty: String(vars[key] ?? "").trim().length > 0,
      decision: classifyNewsWorkerVariable(key),
    }));
}

async function dbIntegrity(client) {
  const checks = {};

  const tables = ["published_news", "news_posts"];
  for (const table of tables) {
    const { count } = await client.from(table).select("*", { count: "exact", head: true });
    checks[table] = { rowCount: count };
  }

  const { data: latestPublished } = await client
    .from("published_news")
    .select("published_at")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  checks.latestPublishedAt = latestPublished?.published_at || null;

  const { data: latestPost } = await client
    .from("news_posts")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  checks.latestPostAt = latestPost?.created_at || null;

  try {
    const { auditSitePublishParity } = require("../../worker/lib/news-site-recovery.js");
    const parity = await auditSitePublishParity(() => client, {
      since: "2026-08-03T07:03:02.521+00:00",
      limit: 300,
    });
    if (parity.ok) {
      checks.sitePublishParity = parity.summary;
    }
  } catch {
    // optional in audit environments without module resolution
  }

  return checks;
}

export async function runNewsWorkerProductionAudit({ phase = "audit" } = {}) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  assertProductionSupabaseConfig({
    projectRef: extractSupabaseProjectRef(local.NEXT_PUBLIC_SUPABASE_URL || ""),
    url: local.NEXT_PUBLIC_SUPABASE_URL,
  });

  const vars = railwayVars(NEWS_SERVICE);
  const envProbe = {
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT: "production",
    PORT: "8080",
    ...(vars || {}),
  };
  const prev = { ...process.env };
  Object.assign(process.env, envProbe);
  const contract = validateNewsWorkerEnvironment({ production: true });
  Object.assign(process.env, prev);

  const sb = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const db = await dbIntegrity(sb);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  const report = {
    timestamp,
    phase: `news-worker-${phase}`,
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    serviceId: NEWS_SERVICE,
    environmentContract: {
      ok: contract.ok,
      missingRequiredCount: contract.missingRequiredCount,
      invalidRequiredCount: contract.invalidRequiredCount,
    },
    variables: auditVariables(vars),
    dbIntegrity: db,
  };

  const file = join(ARTIFACT_DIR, `news-worker-${phase}-${timestamp}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ contractOk: contract.ok, artifact: file.replace(`${ROOT}/`, "") }, null, 2));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNewsWorkerProductionAudit({ phase: process.argv.includes("--post") ? "post" : "pre" }).catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  });
}
