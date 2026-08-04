#!/usr/bin/env node
/**
 * Production backfill execute — safe candidates only, single run.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { PRODUCTION_SUPABASE_PROJECT_REF, maskProjectRef, extractSupabaseProjectRef } from "../../lib/production-env-guard.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const BOOTSTRAP_ENV = resolve(ROOT, ".env.production.bootstrap.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const DEV_PORT = 3014;

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
  return {
    ...process.env,
    NODE_ENV: "development",
    IAM_DB: "true",
    IAM_API: "false",
    IAM_UI: "false",
    IAM_RLS: "false",
    ...parseEnvFile(PROD_ENV),
    ...parseEnvFile(BOOTSTRAP_ENV),
  };
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
    console.error(JSON.stringify({ verdict: "BACKFILL FAILED", error: "not_production_ref" }));
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

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
      console.error(JSON.stringify({ verdict: "BACKFILL FAILED", error: "login_failed" }));
      process.exit(1);
    }

    const cookie = extractCookie(loginRes.headers.getSetCookie?.() || [], "hc_access_token");
    const cookieHeader = cookie ? `hc_access_token=${cookie}` : "";

    const preDry = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ action: "dry_run_backfill", confirm: "DRY_RUN_BACKFILL" }),
    });

    const preReport = preDry.body?.report || {};
    const preOk =
      preDry.status === 200 &&
      preReport.safeCandidates === 2 &&
      preReport.reviewRequiredCandidates === 1 &&
      preReport.expectedActiveAssignmentsAfterExecute === 3;

    if (!preOk) {
      console.error(
        JSON.stringify({
          verdict: "BACKFILL FAILED",
          error: "pre_execute_dry_run_mismatch",
          preReport: {
            safeCandidates: preReport.safeCandidates,
            reviewRequiredCandidates: preReport.reviewRequiredCandidates,
            expectedActive: preReport.expectedActiveAssignmentsAfterExecute,
          },
        })
      );
      process.exit(1);
    }

    const execRes = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ action: "execute_backfill" }),
    });

    const postDry = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ action: "dry_run_backfill", confirm: "DRY_RUN_BACKFILL" }),
    });

    const artifact = {
      phase: "production-backfill-execute",
      timestamp: ts,
      projectRefMasked: maskProjectRef(usedRef),
      preDryRun: {
        safeCandidates: preReport.safeCandidates,
        reviewRequiredCandidates: preReport.reviewRequiredCandidates,
      },
      execute: {
        status: execRes.status,
        success: execRes.body?.success,
        granted: execRes.body?.result?.granted,
        skipped: execRes.body?.result?.skipped,
        skippedReviewRequired: execRes.body?.result?.skippedReviewRequired?.map((s) => ({
          maskedEmail: s.maskedEmail,
          reason: s.reason,
        })),
        errors: execRes.body?.result?.errors,
      },
      postDryRun: postDry.body?.report
        ? {
            safeCandidates: postDry.body.report.safeCandidates,
            reviewRequiredCandidates: postDry.body.report.reviewRequiredCandidates,
            expectedActive: postDry.body.report.expectedActiveAssignmentsAfterExecute,
            expectedSuperAdmin: postDry.body.report.expectedSuperAdminCountAfterExecute,
          }
        : null,
    };

    const ok =
      execRes.status === 200 &&
      execRes.body?.success === true &&
      execRes.body?.result?.granted === 2 &&
      (execRes.body?.result?.skippedReviewRequired?.length || 0) >= 1 &&
      postDry.body?.report?.safeCandidates === 0 &&
      postDry.body?.report?.expectedActiveAssignmentsAfterExecute === 3;

    artifact.verdict = ok ? "BACKFILL EXECUTED" : "BACKFILL FAILED";

    const path = join(ARTIFACT_DIR, `production-backfill-execute-${ts}.json`);
    writeFileSync(path, JSON.stringify(artifact, null, 2));
    console.log(JSON.stringify({ verdict: artifact.verdict, artifact: path, execute: artifact.execute, postDryRun: artifact.postDryRun }, null, 2));
    process.exit(ok ? 0 : 1);
  } finally {
    dev.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ verdict: "BACKFILL FAILED", error: e.message }));
  process.exit(1);
});
