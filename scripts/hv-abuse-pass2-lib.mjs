/**
 * Pass 2 shared helpers — Staging only (tvkhuijufhnpqpchkyss)
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  STAGING_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import {
  isIsolatedValidationTarget,
  loadIsolatedHarnessEnv,
  getValidationRestoreProjectRef,
} from "../lib/isolated-env-guard.js";

export const ROOT = resolve(process.cwd());
export const FIXTURE_DOMAIN = "staging-hcw.test";
export const TURNSTILE_PASS_SITE = "1x00000000000000000000AA";
export const TURNSTILE_PASS_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_FAIL_SECRET = "2x0000000000000000000000000000000AA";
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export function getLinkedRef() {
  const p = join(ROOT, "supabase/.temp/project-ref");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8").trim();
}

export function linkProject(ref) {
  spawnSync("npx", ["supabase", "link", "--project-ref", ref, "--yes"], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
}

export function assertStagingGuard(report) {
  if (isIsolatedValidationTarget()) {
    const target = loadIsolatedHarnessEnv();
    const linked = getLinkedRef();
    report.validationTarget = {
      mode: "isolated",
      cliLinkedRef: maskProjectRef(linked),
      expectedRef: target.projectRef,
      isolatedTargetConfirmed: true,
      productionNotLinked: true,
      sharedStagingNotTargetedForWrites: true,
    };
    report.stagingTarget = report.validationTarget;
    if (linked === PRODUCTION_SUPABASE_PROJECT_REF) throw new Error("ABORT: CLI linked to production");
    if (linked === STAGING_SUPABASE_PROJECT_REF) {
      throw new Error("ABORT: isolated run must not target shared staging CLI link");
    }
    if (linked !== target.projectRef) {
      throw new Error(`ABORT: expected isolated ${target.maskedProjectRef}`);
    }
    return target.projectRef;
  }
  let linked = getLinkedRef();
  if (linked !== STAGING_SUPABASE_PROJECT_REF) {
    linkProject(STAGING_SUPABASE_PROJECT_REF);
    linked = getLinkedRef();
  }
  if (linked === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: CLI linked to production");
  }
  if (linked !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: expected staging ${maskProjectRef(STAGING_SUPABASE_PROJECT_REF)}`);
  }
  report.stagingTarget = {
    cliLinkedRef: maskProjectRef(linked),
    expectedRef: STAGING_SUPABASE_PROJECT_REF,
    productionNotLinked: linked !== PRODUCTION_SUPABASE_PROJECT_REF,
  };
  return linked;
}

function parseEnvLines(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) keys.add(t.slice(0, i).trim());
  }
  return keys;
}

export function ensureHmacSecretConsistency(report) {
  const envPath = join(ROOT, ".env.staging.local");
  if (!existsSync(envPath)) throw new Error("Missing .env.staging.local");
  let content = readFileSync(envPath, "utf8");
  const keys = parseEnvLines(content);
  let source = "env_file";
  if (!keys.has("SECURITY_SIGNAL_HMAC_SECRET")) {
    const secret = crypto.randomBytes(32).toString("hex");
    appendFileSync(envPath, `\nSECURITY_SIGNAL_HMAC_SECRET=${secret}\n`);
    source = "generated_staging_local";
  }
  loadStagingEnvFile();
  const secret = process.env.SECURITY_SIGNAL_HMAC_SECRET || process.env.STAGING_SECURITY_SIGNAL_HMAC_SECRET;
  if (!secret) throw new Error("SECURITY_SIGNAL_HMAC_SECRET still missing after ensure");
  process.env.SECURITY_SIGNAL_HMAC_SECRET = secret;

  const railwayCheck = spawnSync(
    "npx",
    ["@railway/cli@latest", "variables", "--service", "hasan-chart-website-staging", "--environment", "staging", "--json"],
    { cwd: ROOT, encoding: "utf8", timeout: 60000 }
  );
  let railwayPresent = false;
  let railwaySet = false;
  if (railwayCheck.status === 0) {
    try {
      const vars = JSON.parse(railwayCheck.stdout || "{}");
      railwayPresent = Object.prototype.hasOwnProperty.call(vars, "SECURITY_SIGNAL_HMAC_SECRET");
      if (!railwayPresent) {
        const set = spawnSync(
          "npx",
          [
            "@railway/cli@latest",
            "variable",
            "set",
            `SECURITY_SIGNAL_HMAC_SECRET=${secret}`,
            "--service",
            "hasan-chart-website-staging",
            "--environment",
            "staging",
            "--skip-deploys",
          ],
          { cwd: ROOT, encoding: "utf8", timeout: 60000 }
        );
        railwaySet = set.status === 0;
        railwayPresent = set.status === 0;
      }
    } catch {
      report.hmacSecret.railwayParseError = true;
    }
  }

  const h1 = crypto.createHmac("sha256", secret).update("probe-a").digest("hex");
  const h2 = crypto.createHmac("sha256", secret).update("probe-a").digest("hex");
  report.hmacSecret = {
    localConfigured: true,
    source,
    railwayPresent,
    railwaySet,
    stableAcrossProcess: h1 === h2,
    valuePrinted: false,
  };
  return secret;
}

export function loadStagingClients() {
  loadStagingEnvFile();
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.STAGING_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.STAGING_SUPABASE_ANON_KEY;
  if (process.env.STAGING_SUPABASE_PROJECT_REF === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Production ref in staging env");
  }
  const url = process.env.STAGING_SUPABASE_URL;
  const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  return { service, anon, url, anonKey };
}

export function runSql(sql, { linked = true } = {}) {
  const args = linked ? ["db", "query", "--linked", sql] : ["db", "query", sql];
  const result = spawnSync("npx", ["supabase", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "SQL failed");
  const raw = result.stdout || "";
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      return JSON.parse(raw.slice(jsonStart));
    } catch {
      return { raw };
    }
  }
  return { raw };
}

export function createManifestRecorder(report) {
  report.manifest = report.manifest || { scenarios: [], counts: {} };
  report.errors = report.errors || [];
  return function record(id, category, description, executionType, ok, evidence = {}) {
    const result = ok ? "PASS" : "FAIL";
    report.manifest.scenarios.push({ id, category, description, executionType, result, evidence });
    report.manifest.counts[executionType] = (report.manifest.counts[executionType] || 0) + 1;
    report.manifest.counts.total = (report.manifest.counts.total || 0) + 1;
    if (!ok) report.errors.push({ id, category, description });
    return ok;
  };
}

export async function httpJson(base, path, { method = "GET", body, headers = {}, cookies = "" } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies ? { Cookie: cookies } : {}),
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(Number(process.env.HV_HTTP_TIMEOUT_MS) || 20000),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  return { status: res.status, json, setCookie, headers: res.headers };
}

export function mergeCookies(existing = "", setCookie = []) {
  const jar = new Map();
  for (const part of String(existing || "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k) jar.set(k, v || "");
  }
  for (const c of setCookie) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (k) jar.set(k.trim(), v || "");
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function extractDeviceCookie(setCookie = []) {
  for (const c of setCookie) {
    if (c.startsWith("hc_device=")) return c.split(";")[0];
  }
  return "";
}

export function financialSnapshot(service) {
  const tables = [
    "partner_commissions",
    "partner_reward_entitlements",
    "partner_financial_ledger_entries",
    "partner_wallet_ledger",
    "partner_withdrawals",
    "partner_mission_progress",
    "partner_fraud_assessments",
    "partner_financial_risk_holds",
  ];
  return runSql(`
    SELECT json_build_object(
      'partner_commissions', (SELECT count(*)::bigint FROM public.partner_commissions),
      'partner_reward_entitlements', (SELECT count(*)::bigint FROM public.partner_reward_entitlements),
      'partner_financial_ledger_entries', (SELECT count(*)::bigint FROM public.partner_financial_ledger_entries),
      'partner_wallet_ledger', (SELECT count(*)::bigint FROM public.partner_wallet_ledger),
      'partner_withdrawals', (SELECT count(*)::bigint FROM public.partner_withdrawals),
      'partner_mission_progress', (SELECT count(*)::bigint FROM public.partner_mission_progress),
      'partner_fraud_assessments', (SELECT count(*)::bigint FROM public.partner_fraud_assessments),
      'partner_financial_risk_holds', (SELECT count(*)::bigint FROM public.partner_financial_risk_holds),
      'account_risk_signals', (SELECT count(*)::bigint FROM public.account_risk_signals)
    ) AS snap;
  `).rows?.[0]?.snap;
}

export async function ensureUser(service, email, password, meta = {}) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: meta.email_confirm !== false,
    user_metadata: meta,
  });
  if (error && !String(error.message).includes("already")) throw error;
  if (data?.user?.id) return data.user.id;
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found?.id) throw new Error(`user_missing:${email}`);
  return found.id;
}

export async function cleanupRunFixtures(service, runTag, userIds = []) {
  if (userIds.length) {
    await service.from("account_risk_signals").delete().in("user_id", userIds);
    for (const id of userIds) {
      await service.from("partner_referrals").delete().eq("referred_user_id", id);
      await service.auth.admin.deleteUser(id).catch(() => null);
    }
  }
  const orphan = runSql(`
    SELECT count(*)::int AS c FROM public.profiles WHERE email LIKE '%${runTag}%@staging-hcw.test';
  `).rows?.[0]?.c;
  return { orphanProfiles: orphan ?? -1 };
}

export const STAGING_PARTNER_FEATURE_FLAGS = {
  PARTNER_ADMIN_MARKETING: "true",
  NEXT_PUBLIC_PARTNER_ADMIN_MARKETING: "true",
  PARTNER_GROWTH_ENGINE: "true",
  NEXT_PUBLIC_PARTNER_GROWTH_ENGINE: "true",
  PARTNER_CENTER_V2_UI: "true",
  NEXT_PUBLIC_PARTNER_CENTER_V2_UI: "true",
  HUMAN_VERIFICATION_ENABLED: "true",
  PARTNER_ANTI_ABUSE_GATE_ENABLED: "true",
  TURNSTILE_LOGIN_ADAPTIVE_ENABLED: "true",
};

export function applyStagingPartnerFeatureFlags(env = {}) {
  return { ...env, ...STAGING_PARTNER_FEATURE_FLAGS };
}

export function startDevServer(port, env) {
  const devEnv = applyStagingPartnerFeatureFlags({
    ...process.env,
    ...env,
    NODE_ENV: "development",
    IAM_DB: "true",
    IAM_API: "true",
    IAM_UI: "true",
    IAM_RLS: "false",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_PASS_SITE,
    TURNSTILE_SECRET_KEY: TURNSTILE_PASS_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: env.STAGING_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.STAGING_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    LOGIN_CHALLENGE_TTL_MS: env.LOGIN_CHALLENGE_TTL_MS || process.env.LOGIN_CHALLENGE_TTL_MS || "",
  });
  return spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: ROOT,
    env: devEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function waitForDevServer(port, ms = 120000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Dev server timeout on ${port}`);
}

export function stopDev(dev) {
  if (!dev || dev.killed) return;
  dev.kill("SIGTERM");
}

export function runNodeScript(relPath) {
  const r = spawnSync("node", [relPath], { cwd: ROOT, encoding: "utf8", env: process.env });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const pass = r.status === 0 && !/fail\s+\d|✖|not ok/i.test(out);
  const countMatch = out.match(/ℹ tests (\d+)[\s\S]*ℹ pass (\d+)/) || out.match(/(\d+)\/(\d+) PASS/);
  return {
    exit: r.status,
    pass: r.status === 0 && (pass || /pass \d+/i.test(out)),
    tests: countMatch ? Number(countMatch[1] || countMatch[2]) : null,
    passed: countMatch ? Number(countMatch[2] || countMatch[1]) : null,
    tail: out.slice(-400),
  };
}

const PRODUCTION_AUDIT_SELECT_SQL = `
  SELECT json_build_object(
    'profiles', (SELECT count(*)::bigint FROM public.profiles),
    'partners', (SELECT count(*)::bigint FROM public.partners),
    'partner_commissions', (SELECT count(*)::bigint FROM public.partner_commissions),
    'human_verification_column', EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles'
      AND column_name='human_verification_status'
    ),
    'account_risk_signals_table', to_regclass('public.account_risk_signals') IS NOT NULL,
    'migration_human_verification', EXISTS(
      SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260812120000'
    )
  ) AS audit;
`;

const PRODUCTION_READ_ONLY_SQL_RE = /^\s*(select|with)\b/is;
const PRODUCTION_MUTATION_SQL_RE =
  /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|call|merge|replace)\b/is;

function assertProductionReadOnlySql(sql) {
  const normalized = String(sql || "").trim();
  if (!PRODUCTION_READ_ONLY_SQL_RE.test(normalized)) {
    throw new Error("ABORT: production audit SQL must be SELECT-only");
  }
  if (PRODUCTION_MUTATION_SQL_RE.test(normalized)) {
    throw new Error("ABORT: production audit SQL contains forbidden mutation keyword");
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientProductionAuditError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  const code = String(err?.code || "");
  if (/401|403|permission denied|malformed|schema mismatch|must be select-only|forbidden mutation/i.test(msg)) {
    return false;
  }
  return (
    /initialising login role|fetch failed|econnreset|epipe|etimedout|enotfound|network|timeout|503|502|504|aborted/i.test(
      msg
    ) || ["ECONNRESET", "EPIPE", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT"].includes(code)
  );
}

function resolveSupabaseAccessToken() {
  const envToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
  if (envToken) return envToken;
  if (process.platform === "darwin") {
    const result = spawnSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
      encoding: "utf8",
    });
    if (result.status === 0 && result.stdout?.trim()) {
      const raw = result.stdout.trim();
      if (raw.startsWith("go-keyring-base64:")) {
        return Buffer.from(raw.slice(18), "base64").toString("utf8").trim();
      }
      return raw;
    }
  }
  return null;
}

function normalizeProductionQueryRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function runProductionManagementQuery(sql, { timeoutMs = 60000 } = {}) {
  assertProductionReadOnlySql(sql);
  const token = resolveSupabaseAccessToken();
  if (!token) throw new Error("Missing Supabase access token for production read-only audit");

  const targetRef = PRODUCTION_SUPABASE_PROJECT_REF;
  const response = await fetch(`https://api.supabase.com/v1/projects/${targetRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error || text.slice(0, 400) || `HTTP ${response.status}`;
    throw new Error(`production_management_query_failed:${detail}`);
  }
  return normalizeProductionQueryRows(payload);
}

async function runProductionPgQuery(sql, password, { timeoutMs = 60000 } = {}) {
  assertProductionReadOnlySql(sql);
  const pg = (await import("pg")).default;
  const client = new pg.Client({
    connectionString: `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    return rows;
  } finally {
    await client.end();
  }
}

async function runProductionReadOnlyQueryWithRetry(sql) {
  const maxAttempts = 3;
  const backoffs = [0, 1000, 3000];
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (backoffs[attempt]) await sleepMs(backoffs[attempt]);
    try {
      const rows = await runProductionManagementQuery(sql);
      return { rows, connectionMode: "management_api" };
    } catch (err) {
      lastError = err;
      if (!isTransientProductionAuditError(err) || attempt === maxAttempts - 1) break;
    }
  }

  const password = String(process.env.PRODUCTION_SUPABASE_DB_PASSWORD || "").trim();
  if (password) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (backoffs[attempt]) await sleepMs(backoffs[attempt]);
      try {
        const rows = await runProductionPgQuery(sql, password);
        return { rows, connectionMode: "direct_pg" };
      } catch (err) {
        lastError = err;
        if (!isTransientProductionAuditError(err) || attempt === maxAttempts - 1) break;
      }
    }
  }

  throw lastError || new Error("production_read_only_audit_failed");
}

function assertProductionReadOnlyGuard() {
  const targetRef = PRODUCTION_SUPABASE_PROJECT_REF;
  const linked = getLinkedRef();
  if (linked === targetRef) {
    throw new Error("ABORT: CLI must not remain linked to production before read-only audit");
  }
  return {
    targetRef,
    targetRefConfirmed: targetRef === PRODUCTION_SUPABASE_PROJECT_REF,
    readOnlyMode: true,
    noMigration: true,
    noDml: true,
    noRpcMutation: true,
    cliLinkedRef: maskProjectRef(linked),
  };
}

export async function productionReadOnlyAudit(report) {
  const guard = assertProductionReadOnlyGuard();
  const validationRestoreRef = getValidationRestoreProjectRef();
  try {
    const { rows, connectionMode } = await runProductionReadOnlyQueryWithRetry(PRODUCTION_AUDIT_SELECT_SQL);
    const auditRow = rows?.[0]?.audit ?? rows?.[0] ?? null;
    report.productionReadOnlyAudit = {
      completed: true,
      pass: true,
      readOnly: true,
      readOnlyMode: guard.readOnlyMode,
      targetRef: guard.targetRef,
      targetRefConfirmed: guard.targetRefConfirmed,
      noMigration: guard.noMigration,
      noDml: guard.noDml,
      noRpcMutation: guard.noRpcMutation,
      connectionMode,
      productionLinkedForReadOnly: false,
      productionWrites: 0,
      counts: auditRow,
      turnstileEnvNames: ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SECURITY_SIGNAL_HMAC_SECRET"],
    };
  } finally {
    report.productionReadOnlyAudit = report.productionReadOnlyAudit || {};
    report.productionReadOnlyAudit.finalLinkedRef = maskProjectRef(getLinkedRef());
    report.productionReadOnlyAudit.restoredValidationLink = getLinkedRef() === validationRestoreRef;
    report.productionReadOnlyAudit.linkRestored = getLinkedRef() !== PRODUCTION_SUPABASE_PROJECT_REF;
    report.productionReadOnlyAudit.productionLinkedForReadOnly =
      report.productionReadOnlyAudit.productionLinkedForReadOnly ?? false;
    report.productionReadOnlyAudit.productionWrites = report.productionReadOnlyAudit.productionWrites ?? 0;
  }
}
