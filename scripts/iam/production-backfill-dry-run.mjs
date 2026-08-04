#!/usr/bin/env node
/**
 * Production backfill dry-run only — no execute, no assignment mutations.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PRODUCTION_SUPABASE_PROJECT_REF, maskProjectRef, extractSupabaseProjectRef } from "../../lib/production-env-guard.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const BOOTSTRAP_ENV = resolve(ROOT, ".env.production.bootstrap.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const DEV_PORT = 3013;

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = val;
  }
  return out;
}

function loadEnv() {
  const env = {
    ...process.env,
    NODE_ENV: "development",
    IAM_DB: "true",
    IAM_API: "false",
    IAM_UI: "false",
    IAM_RLS: "false",
    ...parseEnvFile(PROD_ENV),
    ...parseEnvFile(BOOTSTRAP_ENV),
  };
  delete env.NEXT_PUBLIC_SITE_URL;
  return env;
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body, headers: res.headers };
}

function extractCookie(setCookieHeaders, name) {
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const h of headers) {
    if (!h) continue;
    const m = String(h).match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

function waitForServer(port, timeoutMs = 180000) {
  return new Promise((resolvePromise, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok || res.status < 500) return resolvePromise(true);
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("Server startup timeout"));
      setTimeout(tick, 2000);
    };
    tick();
  });
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const env = loadEnv();
  const usedRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (usedRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    console.error(JSON.stringify({ verdict: "BACKFILL FIX FAILED", error: "not_production_ref" }));
    process.exit(1);
  }

  const dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

  try {
    await waitForServer(DEV_PORT);
    const base = `http://127.0.0.1:${DEV_PORT}`;

    const loginRes = await httpJson(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.IAM_OWNER_EMAIL,
        password: env.PRODUCTION_OWNER_PASSWORD,
      }),
    });

    if (!loginRes.body?.success) {
      console.error(JSON.stringify({ verdict: "BACKFILL FIX FAILED", error: "login_failed", status: loginRes.status }));
      process.exit(1);
    }

    const cookie = extractCookie(loginRes.headers.getSetCookie?.() || [], "hc_access_token");
    const dryRun = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie ? `hc_access_token=${cookie}` : "" },
      body: JSON.stringify({ action: "dry_run_backfill", confirm: "DRY_RUN_BACKFILL" }),
    });

    const report = dryRun.body?.report || {};
    const artifact = {
      phase: "production-backfill-dry-run",
      timestamp: ts,
      projectRefMasked: maskProjectRef(usedRef),
      status: dryRun.status,
      dryRun: dryRun.body?.dryRun,
      report,
      expected: {
        safeCandidates: 2,
        reviewRequiredCandidates: 1,
        proposedAssignments: 2,
        expectedActiveAssignmentsAfterExecute: 3,
        expectedSuperAdminCountAfterExecute: 1,
      },
    };

    const matches =
      dryRun.status === 200 &&
      report.safeCandidates === 2 &&
      report.reviewRequiredCandidates === 1 &&
      report.proposedAssignments?.length === 2 &&
      report.expectedActiveAssignmentsAfterExecute === 3 &&
      report.expectedSuperAdminCountAfterExecute === 1 &&
      report.candidates?.some((c) => c.maskedEmail?.includes("test.local") && c.isTestAccount && c.requiresHumanReview) &&
      report.candidates?.some((c) => c.sources?.includes("profiles.admin_role") && c.profileRole === "user");

    artifact.verdict = matches ? "BACKFILL DRY-RUN READY" : "BACKFILL FIX FAILED";

    const path = join(ARTIFACT_DIR, `production-backfill-dryrun-${ts}.json`);
    writeFileSync(path, JSON.stringify(artifact, null, 2));

    console.log(
      JSON.stringify(
        {
          verdict: artifact.verdict,
          artifact: path,
          safeCandidates: report.safeCandidates,
          reviewRequiredCandidates: report.reviewRequiredCandidates,
          proposedCount: report.proposedAssignments?.length,
          expectedActive: report.expectedActiveAssignmentsAfterExecute,
          candidates: (report.candidates || []).map((c) => ({
            maskedEmail: c.maskedEmail,
            proposedRole: c.proposedRole,
            isTestAccount: c.isTestAccount,
            requiresHumanReview: c.requiresHumanReview,
            safeForExecute: c.safeForExecute,
            sources: c.sources,
          })),
        },
        null,
        2
      )
    );

    process.exit(matches ? 0 : 1);
  } finally {
    dev.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ verdict: "BACKFILL FIX FAILED", error: e.message }));
  process.exit(1);
});
