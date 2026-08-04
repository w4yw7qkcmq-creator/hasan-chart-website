#!/usr/bin/env node
/**
 * Production IAM_DB=true activation — validation and monitoring only.
 * Railway variable must be set separately (CLI or dashboard).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { PRODUCTION_SUPABASE_PROJECT_REF, maskProjectRef, extractSupabaseProjectRef } from "../../lib/production-env-guard.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const BOOTSTRAP_ENV = resolve(ROOT, ".env.production.bootstrap.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const PROD_URL = "https://www.hasanchartworld.com";

function ts() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

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

function loadSecrets() {
  return { ...parseEnvFile(PROD_ENV), ...parseEnvFile(BOOTSTRAP_ENV) };
}

function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  return `${e.slice(0, 3)}***@${e.slice(at + 1)}`;
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
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

async function login(base, email, password) {
  const res = await httpJson(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = extractCookie(res.headers.getSetCookie?.() || [], "hc_access_token");
  return { ok: res.body?.success === true, cookie, status: res.status };
}

async function fetchIamMe(base, cookie) {
  const res = await httpJson(`${base}/api/iam/me`, {
    headers: { Cookie: cookie ? `hc_access_token=${cookie}` : "" },
  });
  const iam = res.body?.iam || res.body?.data?.iam || {};
  return {
    status: res.status,
    isAdmin: iam.isAdmin,
    roles: iam.roles || [],
    permissions: iam.permissionsList || iam.permissions || [],
    source: iam.source,
    featureFlags: iam.featureFlags || res.body?.featureFlags,
  };
}

async function fetchIamHealth(base, cookie) {
  const res = await httpJson(`${base}/api/iam/health`, {
    headers: { Cookie: cookie ? `hc_access_token=${cookie}` : "" },
  });
  const r = res.body?.report || res.body?.readiness || res.body || {};
  return {
    status: res.status,
    schemaConfigured: r.schemaConfigured,
    bootstrapCompleted: r.bootstrapCompleted,
    assignmentsCount: r.assignmentsCount,
    superAdminCount: r.superAdminCount,
    flags: r.flags || r.flagValidation?.flags,
    misconfigured: r.flagValidation?.misconfigured ?? r.misconfigured,
    iamStatus: r.status,
  };
}

async function smokeGet(path, cookie = "") {
  const res = await httpJson(`${PROD_URL}${path}`, {
    headers: cookie ? { Cookie: `hc_access_token=${cookie}` } : {},
  });
  return { path, status: res.status, ok: res.status >= 200 && res.status < 400 };
}

async function waitForIamDb(timeoutMs = 900000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const health = await httpJson(`${PROD_URL}/api/health`);
    const commit = health.body?.build?.commit || "";
    try {
      const secrets = loadSecrets();
      const owner = await login(PROD_URL, secrets.IAM_OWNER_EMAIL, secrets.PRODUCTION_OWNER_PASSWORD);
      if (!owner.ok) throw new Error("owner_login_failed");
      const iamHealth = await fetchIamHealth(PROD_URL, owner.cookie);
      if (iamHealth.flags?.IAM_DB === true) {
        return { ready: true, commit, iamHealth };
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  return { ready: false };
}

async function runValidation(mode = "post") {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const secrets = loadSecrets();
  const usedRef = extractSupabaseProjectRef(secrets.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (usedRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("not_production_ref");
  }

  const health = await httpJson(`${PROD_URL}/api/health`);
  const artifact = {
    phase: mode === "pre" ? "production-iam-db-pre" : "production-iam-db-post",
    timestamp: ts(),
    projectRefMasked: maskProjectRef(usedRef),
    productionUrl: PROD_URL,
    health: {
      status: health.body?.status,
      readiness: health.body?.readiness,
      database: health.body?.checks?.database?.status,
      commit: health.body?.build?.commit,
    },
  };

  if (mode === "post" && secrets.IAM_OWNER_EMAIL && secrets.PRODUCTION_OWNER_PASSWORD) {
    const ownerLogin = await login(PROD_URL, secrets.IAM_OWNER_EMAIL, secrets.PRODUCTION_OWNER_PASSWORD);
    artifact.ownerLogin = { ok: ownerLogin.ok, status: ownerLogin.status };

    if (ownerLogin.ok) {
      artifact.iamHealth = await fetchIamHealth(PROD_URL, ownerLogin.cookie);
      artifact.ownerMe = await fetchIamMe(PROD_URL, ownerLogin.cookie);

      const adminPaths = [
        "/api/admin/dashboard",
        "/api/admin/user-management/stats",
        "/api/admin/financial-center",
        "/api/daily-analysis/admin-access",
        "/api/admin/notification-test",
      ];
      artifact.adminSmoke = [];
      for (const p of adminPaths) {
        artifact.adminSmoke.push(await smokeGet(p, ownerLogin.cookie));
      }

      artifact.siteSmoke = [];
      for (const p of ["/", "/api/auth/session"]) {
        artifact.siteSmoke.push(await smokeGet(p));
      }
    }
  }

  const fname = join(ARTIFACT_DIR, `${artifact.phase}-${artifact.timestamp}.json`);
  writeFileSync(fname, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ artifact: fname, ...artifact }, null, 2));
  return artifact;
}

async function main() {
  const cmd = process.argv[2] || "validate-post";
  if (cmd === "pre") {
    await runValidation("pre");
    return;
  }
  if (cmd === "wait-iam-db") {
    const r = await waitForIamDb();
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ready ? 0 : 1);
  }
  if (cmd === "set-railway") {
    const r = spawnSync("npx", ["--yes", "@railway/cli@4.5.0", "variables", "set", "IAM_DB=true", "--service", "hasan-chart-web"], {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
      env: process.env,
    });
    console.log(JSON.stringify({ exitCode: r.status, stdout: r.stdout?.slice(0, 500), stderr: r.stderr?.slice(0, 500) }));
    process.exit(r.status === 0 ? 0 : 1);
  }
  await runValidation("post");
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
