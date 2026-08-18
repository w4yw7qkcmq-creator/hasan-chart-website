/**
 * Round 8 staging validation — shared harness utilities (STAGING ONLY).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { applyStagingPartnerFeatureFlags } from "../hv-abuse-pass2-lib.mjs";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import {
  isIsolatedValidationTarget,
  loadIsolatedHarnessEnv,
} from "../../lib/isolated-env-guard.js";
import { transitionReferralQualification, initializeReferralQualification } from "../../lib/partner-center/qualification-engine.js";
import { QUALIFICATION_STATES, FRAUD_RISK_LEVELS } from "../../lib/partner-center/constants.js";
import {
  releasePartnerCommissionAtomic,
  reversePartnerServiceCommissionAtomic,
  reversePartnerServiceCommissionLedgerAlreadyReversed,
  restorePartnerServiceCommissionBalanceAfterLedgerNetZero,
  restorePartnerBalancesAfterLedgerCreditReversal,
  BALANCE_RESTORE_IDEMPOTENCY_PREFIX,
  computeCommissionLedgerNet,
  findLedgerCreditForCommission,
} from "../../lib/partner-center/financial-gateway.js";
import { roundMoney } from "../../lib/partner-center/money.js";
import { setRealVerifiedProfile } from "../hv-pass3-fixture-lib.mjs";

export const R8_DEV_PORT = 3024;
export const FIXTURE_DOMAIN = "staging-hcw.test";
export const ISOLATED_FIXTURE_DOMAIN = "isolated-hcw.test";

export function getR8FixtureDomain() {
  return isIsolatedValidationTarget() ? ISOLATED_FIXTURE_DOMAIN : FIXTURE_DOMAIN;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** RPC casts source_id to uuid for subscription_id — harness seeds must be valid UUIDs. */
export function toCommissionSourceId(seed) {
  const s = String(seed || "").trim();
  if (!s) return crypto.randomUUID();
  if (UUID_RE.test(s)) return s;
  const hash = crypto.createHash("sha256").update(`r8:source:${s}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function mkSourceId() {
  return crypto.randomUUID();
}

export function assertCommissionRpc(rpc, label = "create_partner_commission_atomic") {
  if (rpc.error) {
    throw new Error(`${label}: ${rpc.error.message || JSON.stringify(rpc.error)}`);
  }
  if (!rpc.data?.created) {
    throw new Error(`${label}: expected created=true got ${JSON.stringify(rpc.data)}`);
  }
  return rpc.data;
}

export async function assertNoFraudPollution(service, partnerId, referralId, label = "fixture") {
  const { data, error } = await service
    .from("partner_fraud_assessments")
    .select("id, risk_level, referral_id")
    .eq("partner_id", partnerId)
    .eq("referral_id", referralId)
    .in("risk_level", ["HIGH", "BLOCKED"]);
  if (error) throw error;
  if ((data || []).length > 0) {
    throw new Error(`fraud_pollution_on_${label}: ${JSON.stringify(data)}`);
  }
}

export function assertStagingGuard() {
  loadStagingEnvFile();
  const ref = process.env.STAGING_SUPABASE_PROJECT_REF;
  if (ref === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: Production target detected");
  }
  if (isIsolatedValidationTarget()) {
    if (ref === STAGING_SUPABASE_PROJECT_REF) {
      throw new Error("ABORT: isolated run mapped to shared staging ref");
    }
    loadIsolatedHarnessEnv();
    assertLinkedValidationProject();
    console.log("ISOLATED_GUARD_OK");
  } else {
    if (ref !== STAGING_SUPABASE_PROJECT_REF) {
      throw new Error(`ABORT: unexpected staging ref ${ref}`);
    }
    assertLinkedStagingProject();
    console.log("STAGING_GUARD_OK");
  }
  return {
    url: process.env.STAGING_SUPABASE_URL,
    serviceKey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.STAGING_SUPABASE_ANON_KEY,
    projectRef: ref,
  };
}

export function serviceClient() {
  assertStagingGuard();
  return createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function runStagingSql(sql, { optional = false, retries = 3 } = {}) {
  let lastMessage = "unknown staging sql error";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = spawnSync("npx", ["supabase", "db", "query", "--linked", sql], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (result.status === 0) {
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
    const raw = result.stdout || result.stderr || "";
    lastMessage = parseSqlRpcError(raw);
    const retryable =
      /502|503|504|timeout|password authentication failed|LegacyDbConfigConnectTempRoleError/i.test(lastMessage);
    if (!retryable || attempt === retries) break;
    spawnSync("sleep", ["2"]);
  }
  if (optional) return { rows: [], error: lastMessage };
  throw new Error(lastMessage);
}

function assertLinkedValidationProject() {
  const linkedPath = join(process.cwd(), "supabase/.temp/project-ref");
  if (!existsSync(linkedPath)) {
    throw new Error("ABORT: supabase CLI is not linked — link validation target before running harness");
  }
  const linked = readFileSync(linkedPath, "utf8").trim();
  const expected = isIsolatedValidationTarget()
    ? process.env.ISOLATED_SUPABASE_PROJECT_REF
    : STAGING_SUPABASE_PROJECT_REF;
  if (linked === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: supabase CLI linked to Production (${linked}).`);
  }
  if (isIsolatedValidationTarget() && linked === STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: isolated run must not use shared staging CLI link");
  }
  if (linked !== expected) {
    throw new Error(`ABORT: supabase CLI linked to ${linked}, expected ${expected}`);
  }
}

function assertLinkedStagingProject() {
  assertLinkedValidationProject();
}

function parseSqlRpcError(errText) {
  const text = String(errText || "");
  try {
    const jsonStart = text.indexOf('{"');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(text.slice(jsonStart));
      const inner = String(parsed?.error?.message || "");
      const nested = inner.match(/ERROR:\s+[A-Z0-9]+:\s+([^\n\\]+)/);
      if (nested?.[1]) return nested[1].trim();
    }
  } catch { /* ignore */ }
  const match = text.match(/ERROR:\s+[A-Z0-9]+:\s+([^\n\\]+)/);
  return match?.[1]?.trim() || text.slice(0, 300);
}

export async function applyTestHooksMigration() {
  const migrations = [
    join(process.cwd(), "supabase/migrations/20260820_partner_service_commission_hardening.sql"),
    join(process.cwd(), "supabase/migrations/20260821_partner_service_commission_rpc_hardening.sql"),
    join(
      process.cwd(),
      "scripts/partner-center/staging-fixtures/20260822_partner_service_commission_staging_test_hooks.sql"
    ),
  ];
  for (const path of migrations) {
    const result = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", path], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `SQL failed: ${path}`);
  }
  const reload = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "NOTIFY pgrst, 'reload schema';"],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  if (reload.status !== 0) throw new Error(reload.stderr || reload.stdout || "schema reload failed");
  return { applied: true, paths: migrations, schemaReload: true };
}

export async function partnerBalances(service, partnerId) {
  const { data, error } = await service
    .from("partners")
    .select("balance_bonus_pending, balance_pending, balance_withdrawable, total_earnings, total_withdrawn")
    .eq("id", partnerId)
    .single();
  if (error) throw error;
  return data;
}

const AUTH_LIST_PAGE_SIZE = 200;
const AUTH_LIST_MAX_PAGES = 100;
const AUTH_RETRY_ATTEMPTS = 4;

function normalizeAuthEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAuthEmailCheckDbError(err) {
  return String(err?.message || err || "").toLowerCase().includes("database error checking email");
}

async function withHarnessPgClient(fn) {
  assertStagingGuard();
  const ref = process.env.STAGING_SUPABASE_PROJECT_REF;
  const password = isIsolatedValidationTarget()
    ? process.env.ISOLATED_SUPABASE_DB_PASSWORD
    : process.env.STAGING_SUPABASE_DB_PASSWORD || process.env.ISOLATED_SUPABASE_DB_PASSWORD;
  if (!password) throw new Error("R8_FIXTURE_PREFLIGHT_FAILED:missing_db_password");
  const client = new pg.Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Remove auth.identities rows whose user_id no longer exists in auth.users (blocks createUser). */
export async function purgeOrphanAuthIdentitiesForEmails(emails = []) {
  const normalized = [...new Set(emails.map(normalizeAuthEmail).filter(Boolean))];
  if (!normalized.length) return { deleted: 0, emails: 0 };
  return withHarnessPgClient(async (client) => {
    const res = await client.query(
      `DELETE FROM auth.identities i
       WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.user_id)
         AND lower(coalesce(i.identity_data->>'email', '')) = ANY($1::text[])`,
      [normalized]
    );
    return { deleted: res.rowCount || 0, emails: normalized.length };
  });
}

export async function purgeOrphanAuthIdentitiesForHarnessPatterns() {
  if (!isIsolatedValidationTarget()) return { deleted: 0, skipped: true };
  return withHarnessPgClient(async (client) => {
    const res = await client.query(`
      DELETE FROM auth.identities i
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.user_id)
        AND (
          coalesce(i.identity_data->>'email', '') ilike 'r8-%@%.test'
          OR coalesce(i.identity_data->>'email', '') ilike 'r6-%@%.test'
          OR coalesce(i.identity_data->>'email', '') ilike 'r7-%@%.test'
          OR coalesce(i.identity_data->>'email', '') ilike 'isolated-r7-%@%.test'
        )
    `);
    return { deleted: res.rowCount || 0, skipped: false };
  });
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAuthError(err) {
  const status = Number(err?.status || err?.statusCode || 0);
  if (status === 401 || status === 403) return false;
  const msg = String(err?.message || err || "").toLowerCase();
  const name = String(err?.name || "");
  if (msg.includes("malformed") || msg.includes("invalid json")) return false;
  return (
    name === "AuthRetryableFetchError" ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("epipe") ||
    msg.includes("etimedout") ||
    msg.includes("network")
  );
}

async function withAuthRetry(label, fn, { maxAttempts = AUTH_RETRY_ATTEMPTS } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableAuthError(err) || attempt === maxAttempts) throw err;
      await sleepMs(200 * attempt);
    }
  }
  throw lastErr || new Error(`${label}:auth_retry_exhausted`);
}

export async function findAuthUserByEmailPaginated(service, email, options = {}) {
  const normalized = normalizeAuthEmail(email);
  const pageSize = options.pageSize || AUTH_LIST_PAGE_SIZE;
  const maxPages = options.maxPages || AUTH_LIST_MAX_PAGES;
  let pagesScanned = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    pagesScanned = page;
    const { data, error } = await withAuthRetry(`listUsers:${page}`, () =>
      service.auth.admin.listUsers({ page, perPage: pageSize })
    );
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u) => normalizeAuthEmail(u.email) === normalized);
    if (found?.id) {
      return { found: true, user: found, pagesScanned };
    }
    if (users.length < pageSize) {
      return { found: false, user: null, pagesScanned };
    }
  }
  return { found: false, user: null, pagesScanned: maxPages };
}

export async function ensureProfile(service, userId, email, role = "user") {
  if (!userId) throw new Error(`R8_FIXTURE_PROFILE_MISSING_USER:${email}`);
  const { error } = await service.from("profiles").upsert({ id: userId, email, role });
  if (error) throw error;
  return userId;
}

export async function ensureUser(service, email, password, meta = {}, authStats = null) {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) throw new Error("R8_FIXTURE_USER_RESOLUTION_FAILED:empty_email");

  const existing = await findAuthUserByEmailPaginated(service, normalizedEmail);
  if (authStats) {
    authStats.lookupPages = Math.max(authStats.lookupPages || 0, existing.pagesScanned || 0);
  }
  if (existing.found && existing.user?.id) {
    if (authStats) authStats.reused = (authStats.reused || 0) + 1;
    await withAuthRetry(`updateUser:${normalizedEmail}`, () =>
      service.auth.admin.updateUserById(existing.user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(existing.user.user_metadata || {}), ...meta },
      })
    );
    return existing.user.id;
  }

  if (isIsolatedValidationTarget()) {
    await purgeOrphanAuthIdentitiesForEmails([normalizedEmail]);
  }

  async function attemptCreateUser() {
    return withAuthRetry(`createUser:${normalizedEmail}`, () =>
      service.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: meta,
      })
    );
  }

  let { data, error } = await attemptCreateUser();
  if (error && isAuthEmailCheckDbError(error)) {
    await purgeOrphanAuthIdentitiesForEmails([normalizedEmail]);
    ({ data, error } = await attemptCreateUser());
  }
  if (!error && data?.user?.id) {
    if (authStats) authStats.created = (authStats.created || 0) + 1;
    return data.user.id;
  }
  if (error && !String(error.message || "").toLowerCase().includes("already")) {
    throw error;
  }

  const retry = await findAuthUserByEmailPaginated(service, normalizedEmail);
  if (authStats) {
    authStats.lookupPages = Math.max(authStats.lookupPages || 0, retry.pagesScanned || 0);
  }
  if (retry.found && retry.user?.id) {
    if (authStats) authStats.reused = (authStats.reused || 0) + 1;
    await withAuthRetry(`updateUserAfterAlready:${normalizedEmail}`, () =>
      service.auth.admin.updateUserById(retry.user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(retry.user.user_metadata || {}), ...meta },
      })
    );
    return retry.user.id;
  }

  throw new Error(`R8_FIXTURE_USER_RESOLUTION_FAILED:${normalizedEmail}`);
}

/** Remove stale profile rows that share a fixture email but a different auth user id (RPC source_ownership_mismatch). */
export async function ensureUniqueProfileEmailOwner(service, userId, email) {
  const normalized = String(email || "").trim().toLowerCase();
  const canonicalId = String(userId || "").trim();
  if (!normalized || !canonicalId) return { removed: 0, canonicalId, email: normalized };

  const { data: rows, error } = await service
    .from("profiles")
    .select("id,email")
    .ilike("email", normalized);
  if (error) throw error;

  let removed = 0;
  for (const row of rows || []) {
    if (String(row.id) === canonicalId) continue;
    const { error: delErr } = await service.from("profiles").delete().eq("id", row.id);
    if (delErr) throw delErr;
    removed += 1;
  }

  const { error: upsertErr } = await service
    .from("profiles")
    .upsert({ id: canonicalId, email: normalized, role: "user" }, { onConflict: "id" });
  if (upsertErr) throw upsertErr;

  return { removed, canonicalId, email: normalized };
}

export function buildR8CoreFixtureEmails() {
  const domain = getR8FixtureDomain();
  return {
    superAdmin: `r8-super-admin@${domain}`,
    rewardsRead: `r8-rewards-read@${domain}`,
    rewardsManage: `r8-rewards-manage@${domain}`,
    partnerA: `r8-partner-a@${domain}`,
    partnerB: `r8-partner-b@${domain}`,
    unauthorized: `r8-unauthorized@${domain}`,
    referredVerified: `r8-referred-verified@${domain}`,
    referredQualified: `r8-referred-qualified@${domain}`,
    referredInvalid: `r8-referred-invalid@${domain}`,
    partnerFraudHigh: `r8-partner-fraud-high@${domain}`,
    referredFraudHigh: `r8-referred-fraud-high@${domain}`,
  };
}

export async function runR8FixturePreflight(service, runId) {
  Object.assign(process.env, applyStagingPartnerFeatureFlags(process.env));
  const orphanPurge = await purgeOrphanAuthIdentitiesForHarnessPatterns().catch((err) => ({
    deleted: 0,
    error: String(err?.message || err),
  }));
  const iamReference = await ensureR8IamReferenceBaseline(service);
  const ruleBaseline = await ensureR8CommissionRuleBaseline(service);
  const featureFlagsReady =
    process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED === "true" &&
    process.env.HUMAN_VERIFICATION_ENABLED === "true";
  if (!featureFlagsReady) {
    throw new Error(
      `R8_FIXTURE_PREFLIGHT_FAILED:feature_flags:anti_abuse=${process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED}:hv=${process.env.HUMAN_VERIFICATION_ENABLED}`
    );
  }

  const authStats = { required: 11, created: 0, reused: 0, lookupPages: 0 };
  const fx = await initFixturePool(service, runId, authStats);
  const checks = [];
  const required = [
    ["superAdmin", fx.superAdminId, fx.emails.superAdmin, null],
    ["rewardsRead", fx.rewardsReadId, fx.emails.rewardsRead, null],
    ["rewardsManage", fx.rewardsManageId, fx.emails.rewardsManage, null],
    ["partnerA", fx.partnerAUserId, fx.emails.partnerA, fx.partnerAId],
    ["partnerB", fx.partnerBUserId, fx.emails.partnerB, fx.partnerBId],
    ["unauthorized", fx.unauthorizedId, fx.emails.unauthorized, null],
    ["referredVerified", fx.referredVerifiedId, fx.emails.referredVerified, null],
    ["referredQualified", fx.referredQualifiedId, fx.emails.referredQualified, null],
    ["referredInvalid", fx.referredInvalidId, fx.emails.referredInvalid, null],
    ["partnerFraudHigh", fx.partnerFraudHighUserId, fx.emails.partnerFraudHigh, fx.partnerFraudHighId],
    ["referredFraudHigh", fx.referredFraudHighId, fx.emails.referredFraudHigh, null],
  ];

  for (const [label, userId, email, partnerId] of required) {
    if (!userId) {
      throw new Error(`R8_FIXTURE_PREFLIGHT_FAILED:${label}:missing_user_id`);
    }
    await ensureUniqueProfileEmailOwner(service, userId, email);
    const authLookup = await findAuthUserByEmailPaginated(service, email);
    if (!authLookup.found || authLookup.user?.id !== userId) {
      throw new Error(
        `R8_FIXTURE_PREFLIGHT_FAILED:${label}:auth_mismatch:${authLookup.found}:${authLookup.user?.id}:${userId}`
      );
    }
    const { data: profile, error: profileErr } = await service
      .from("profiles")
      .select("id, email, human_verification_status, effective_user_classification")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile?.id) {
      throw new Error(`R8_FIXTURE_PREFLIGHT_FAILED:${label}:missing_profile`);
    }
    if (partnerId) {
      const { data: partner, error: partnerErr } = await service
        .from("partners")
        .select("id, tier_key, status")
        .eq("id", partnerId)
        .maybeSingle();
      if (partnerErr) throw partnerErr;
      if (!partner?.id) {
        throw new Error(`R8_FIXTURE_PREFLIGHT_FAILED:${label}:missing_partner`);
      }
      if (partner.tier_key !== "partner" || partner.status !== "active") {
        throw new Error(
          `R8_FIXTURE_PREFLIGHT_FAILED:${label}:partner_baseline:${partner.tier_key}:${partner.status}`
        );
      }
    }
    checks.push({
      label,
      email,
      userId,
      partnerId: partnerId || null,
      authPagesScanned: authLookup.pagesScanned,
    });
  }

  const { data: qualifiedProfile } = await service
    .from("profiles")
    .select("human_verification_status, effective_user_classification")
    .eq("id", fx.referredQualifiedId)
    .maybeSingle();
  if (qualifiedProfile?.human_verification_status !== "verified") {
    await setRealVerifiedProfile(service, fx.referredQualifiedId, { email: fx.emails.referredQualified, runTag: runId });
  }
  if (qualifiedProfile?.effective_user_classification !== "real") {
    await setRealVerifiedProfile(service, fx.referredQualifiedId, { email: fx.emails.referredQualified, runTag: runId });
  }

  const fraudHighLookup = await findAuthUserByEmailPaginated(service, fx.emails.partnerFraudHigh);
  const referenceRulesReady = Boolean(ruleBaseline?.vipForexEnabled && ruleBaseline?.futureServiceDisabled);
  if (!referenceRulesReady) {
    throw new Error("R8_FIXTURE_PREFLIGHT_FAILED:reference_rules");
  }

  const structured = {
    verdict: "R8_FIXTURE_PREFLIGHT_PASS",
    authFixturesRequired: authStats.required,
    authFixturesResolved: checks.length,
    authFixturesCreated: authStats.created,
    authFixturesReused: authStats.reused,
    authLookupPages: Math.max(authStats.lookupPages, ...checks.map((c) => c.authPagesScanned), fraudHighLookup.pagesScanned),
    profilesReady: true,
    featureFlagsReady,
    referenceRulesReady,
    iamReferenceReady: Boolean(iamReference?.permissions?.length || iamReference?.skipped),
    fixtureDomain: getR8FixtureDomain(),
    orphanIdentityPurge: orphanPurge,
    ruleBaseline,
    iamReference,
  };

  return {
    ok: true,
    runId,
    checks,
    fraudHigh: {
      email: fx.emails.partnerFraudHigh,
      userId: fx.partnerFraudHighUserId,
      partnerId: fx.partnerFraudHighId,
      referralId: fx.refFraudHighId,
      authPagesScanned: fraudHighLookup.pagesScanned,
      authFound: fraudHighLookup.found,
    },
    maxAuthPagesScanned: structured.authLookupPages,
    structured,
    fx,
  };
}

export async function signInJwt(url, anonKey, email, password) {
  const tmp = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await tmp.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw error || new Error("sign_in_failed");
  return {
    token: data.session.access_token,
    cookie: `hc_access_token=${data.session.access_token}`,
    userClient: createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export async function ensureIamRole(service, roleId, label, permissions) {
  await service.from("iam_roles").upsert({
    id: roleId,
    label,
    description: `R8 staging ${roleId}`,
    is_system: false,
    sort_order: 90,
  });
  for (const permission_id of permissions) {
    const { error } = await service.from("iam_role_permissions").upsert(
      { role_id: roleId, permission_id, effect: "allow" },
      { onConflict: "role_id,permission_id" }
    );
    if (error) throw new Error(`R8_IAM_ROLE_PERMISSION_FAILED:${roleId}:${permission_id}:${error.message}`);
  }
}

/** Restore canonical IAM reference rows missing after schema-only isolated clone. */
export async function ensureR8IamReferenceBaseline(service) {
  if (!isIsolatedValidationTarget()) return { skipped: true };

  const orgId = "00000000-0000-0000-0000-000000000001";
  const { error: orgErr } = await service.from("iam_organizations").upsert(
    { id: orgId, slug: "hasan-chart-world", label: "HasaN CharT World" },
    { onConflict: "id" }
  );
  if (orgErr) throw new Error(`R8_IAM_REFERENCE_FAILED:organization:${orgErr.message}`);

  const permissions = [
    { id: "dashboard.read", label: "قراءة لوحة الإدارة", category: "dashboard" },
    { id: "users.read", label: "قراءة المستخدمين", category: "users" },
    { id: "partners.read", label: "عرض الشركاء", category: "partners", description: "View partner admin hub pages" },
    { id: "partners.rewards.read", label: "قراءة مكافآت الشركاء", category: "partners", description: "View partner reward entitlements" },
    { id: "partners.levels.manage", label: "Manage partner levels", category: "partners", description: "View partner tier levels in admin hub" },
    { id: "partners.rewards.manage", label: "إدارة مكافآت الشركاء", category: "partners", description: "Manage partner reward approvals" },
  ];
  for (const row of permissions) {
    const { error } = await service.from("iam_permissions").upsert(row, { onConflict: "id" });
    if (error) throw new Error(`R8_IAM_REFERENCE_FAILED:permission:${row.id}:${error.message}`);
  }

  for (const role of [
    { id: "super_admin", label: "مدير عام", sort_order: 10 },
    { id: "admin", label: "مدير", sort_order: 20 },
  ]) {
    const { error } = await service.from("iam_roles").upsert(
      { ...role, description: role.label, is_system: true },
      { onConflict: "id" }
    );
    if (error) throw new Error(`R8_IAM_REFERENCE_FAILED:role:${role.id}:${error.message}`);
  }

  const adminPerms = ["dashboard.read", "users.read", "partners.read", "partners.rewards.read", "partners.rewards.manage", "partners.levels.manage"];
  for (const permission_id of adminPerms) {
    const { error } = await service.from("iam_role_permissions").upsert(
      { role_id: "admin", permission_id, effect: "allow" },
      { onConflict: "role_id,permission_id" }
    );
    if (error) throw new Error(`R8_IAM_REFERENCE_FAILED:admin:${permission_id}:${error.message}`);
  }
  for (const { id: permission_id } of permissions) {
    const { error } = await service.from("iam_role_permissions").upsert(
      { role_id: "super_admin", permission_id, effect: "allow" },
      { onConflict: "role_id,permission_id" }
    );
    if (error) throw new Error(`R8_IAM_REFERENCE_FAILED:super_admin:${permission_id}:${error.message}`);
  }

  return { organizationId: orgId, permissions: permissions.map((p) => p.id), adminPerms };
}

/** Isolated/staging validation IAM reference — R8 + R9 campaign/mission permissions. */
export async function ensureValidationIamReferenceBaseline(service) {
  const base = await ensureR8IamReferenceBaseline(service);
  if (base.skipped) return base;

  const orgId = "00000000-0000-0000-0000-000000000001";
  const phase1Permissions = [
    {
      id: "partners.fraud.review",
      label: "مراجعة احتيال الشركاء",
      category: "partners",
      description: "Review partner fraud and growth reward holds",
    },
  ];

  for (const row of phase1Permissions) {
    const { error } = await service.from("iam_permissions").upsert(row, { onConflict: "id" });
    if (error) throw new Error(`VALIDATION_IAM_REFERENCE_FAILED:permission:${row.id}:${error.message}`);
  }

  const phase1AdminPerms = phase1Permissions.map((p) => p.id);
  for (const role_id of ["admin", "super_admin"]) {
    for (const permission_id of phase1AdminPerms) {
      const { error } = await service.from("iam_role_permissions").upsert(
        { role_id, permission_id, effect: "allow", organization_id: orgId },
        { onConflict: "role_id,permission_id" }
      );
      if (error) {
        throw new Error(`VALIDATION_IAM_REFERENCE_FAILED:${role_id}:${permission_id}:${error.message}`);
      }
    }
  }

  const phase2Permissions = [
    {
      id: "partners.campaigns.read",
      label: "قراءة حملات الشركاء",
      category: "partners",
      description: "View partner campaign programs",
    },
    {
      id: "partners.campaigns.manage",
      label: "إدارة حملات الشركاء",
      category: "partners",
      description: "Create/update partner campaign programs",
    },
    {
      id: "partners.missions.read",
      label: "قراءة مهام الشركاء",
      category: "partners",
      description: "View partner mission definitions",
    },
    {
      id: "partners.missions.manage",
      label: "إدارة مهام الشركاء",
      category: "partners",
      description: "Create/update partner missions",
    },
  ];

  for (const row of phase2Permissions) {
    const { error } = await service.from("iam_permissions").upsert(row, { onConflict: "id" });
    if (error) throw new Error(`VALIDATION_IAM_REFERENCE_FAILED:permission:${row.id}:${error.message}`);
  }

  const phase2AdminPerms = phase2Permissions.map((p) => p.id);
  for (const role_id of ["admin", "super_admin"]) {
    for (const permission_id of phase2AdminPerms) {
      const { error } = await service.from("iam_role_permissions").upsert(
        { role_id, permission_id, effect: "allow", organization_id: orgId },
        { onConflict: "role_id,permission_id" }
      );
      if (error) {
        throw new Error(`VALIDATION_IAM_REFERENCE_FAILED:${role_id}:${permission_id}:${error.message}`);
      }
    }
  }

  return {
    ...base,
    phase1Permissions: phase1AdminPerms,
    phase2Permissions: phase2AdminPerms,
  };
}

export async function assignRole(service, userId, roleId, iamSnapshot) {
  const { data: before } = await service.from("iam_user_assignments").select("*").eq("user_id", userId);
  iamSnapshot.assignmentsByUser[userId] = before || [];
  await service.from("iam_user_assignments").delete().eq("user_id", userId);
  await service.from("iam_user_assignments").insert({
    user_id: userId,
    role_id: roleId,
    organization_id: "00000000-0000-0000-0000-000000000001",
    grant_reason: "r8-staging-validation",
  });
}

export async function restoreIamSnapshot(service, snapshot) {
  for (const [userId, rows] of Object.entries(snapshot.assignmentsByUser || {})) {
    await service.from("iam_user_assignments").delete().eq("user_id", userId);
    if (rows.length) await service.from("iam_user_assignments").insert(rows);
  }
}

export async function ensurePartnerTierBaseline(service, partnerId, tierKey = "partner") {
  const { error } = await service
    .from("partners")
    .update({ tier_key: tierKey, tier_updated_at: new Date().toISOString() })
    .eq("id", partnerId);
  if (error) throw error;
  return { partnerId, tierKey };
}

export function maskPartnerId(partnerId) {
  const id = String(partnerId || "");
  if (id.length < 12) return "***";
  return `${id.slice(0, 4)}***${id.slice(-4)}`;
}

/** Restore staging commission rule baseline polluted by prior admin/tier scenarios. */
export async function ensureR8CommissionRuleBaseline(service) {
  const now = new Date().toISOString();
  await service
    .from("partner_commission_rules")
    .update({ is_enabled: true, is_active: true, status: "active", updated_at: now })
    .eq("service_type", "vip_forex")
    .eq("status", "active");
  await service
    .from("partner_commission_rules")
    .update({ is_enabled: false, updated_at: now })
    .eq("service_type", "future_service");
  const { data: vipSignal } = await service
    .from("partner_commission_rules")
    .select("id, tier_policy")
    .eq("service_type", "vip_signal")
    .eq("status", "active")
    .maybeSingle();
  if (vipSignal?.id && vipSignal.tier_policy !== "use_partner_tier") {
    await service
      .from("partner_commission_rules")
      .update({ tier_policy: "use_partner_tier", updated_at: now })
      .eq("id", vipSignal.id);
  }
  return {
    vipForexEnabled: true,
    futureServiceDisabled: true,
    vipSignalTierPolicy: "use_partner_tier",
  };
}

async function ledgerCreditAlreadyReversed(service, ledgerEntryId) {
  const { count } = await service
    .from("partner_financial_ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", `ledger:reversal:${ledgerEntryId}`);
  return (count || 0) > 0;
}

export async function reverseR8FixtureCommissionsEconomically(
  service,
  { partnerIds = [], sinceIso = null, reason = "r8_scoped_cleanup", idempotencyLike = null } = {}
) {
  const uniquePartnerIds = [...new Set(partnerIds.filter(Boolean))];
  const report = {
    reversed: 0,
    skipped: 0,
    alreadyReversed: 0,
    balanceRestored: 0,
    alreadyRestored: 0,
    errors: [],
  };
  for (const partnerId of uniquePartnerIds) {
    let query = service
      .from("partner_commissions")
      .select("id, status, source_type, partner_id")
      .eq("partner_id", partnerId);
    if (sinceIso) query = query.gte("created_at", sinceIso);
    if (idempotencyLike) query = query.ilike("idempotency_key", idempotencyLike);
    const { data: commissions, error } = await query;
    if (error) throw error;
    for (const commission of commissions || []) {
      if (commission.source_type === "signup_bonus") {
        report.skipped += 1;
        continue;
      }
      if (commission.status === "reversed" || commission.status === "rejected") {
        try {
          const restored = await restorePartnerServiceCommissionBalanceAfterLedgerNetZero(
            service,
            commission.id,
            { reason }
          );
          if (restored.outcome === "restored") report.balanceRestored += 1;
          else if (restored.outcome === "already_restored") report.alreadyRestored += 1;
          else report.alreadyReversed += 1;
        } catch (err) {
          report.errors.push({ commissionId: commission.id, message: String(err?.message || err) });
        }
        continue;
      }
      try {
        const ledger = await findLedgerCreditForCommission(service, commission.id);
        const already = ledger?.id ? await ledgerCreditAlreadyReversed(service, ledger.id) : false;
        if (already) {
          await reversePartnerServiceCommissionLedgerAlreadyReversed(service, commission.id, {
            reason,
            ledgerEntryId: ledger?.id,
          });
        } else {
          await reversePartnerServiceCommissionAtomic(service, {
            commissionId: commission.id,
            reason,
          });
        }
        report.reversed += 1;
      } catch (err) {
        report.errors.push({ commissionId: commission.id, message: String(err?.message || err) });
      }
    }
  }
  return report;
}

export async function discoverR8PartnerIdsFromCommissions(service, { sinceIso = null } = {}) {
  let query = service.from("partner_commissions").select("partner_id").ilike("idempotency_key", "r8:%");
  if (sinceIso) query = query.gte("created_at", sinceIso);
  const { data, error } = await query.limit(5000);
  if (error) throw error;
  return [...new Set((data || []).map((row) => row.partner_id).filter(Boolean))];
}

export async function discoverActiveR8FixturePartnerIds(service, { sinceIso = null } = {}) {
  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, email")
    .like("email", "r8-%")
    .limit(1000);
  if (error) throw error;
  const domain = getR8FixtureDomain();
  const userIds = (profiles || [])
    .filter((p) => {
      const email = String(p.email || "");
      return /^r8[-_]/i.test(email) && (email.endsWith(`@${domain}`) || email.endsWith(`@${FIXTURE_DOMAIN}`));
    })
    .map((p) => p.id);
  if (!userIds.length) return { userIds: [], partnerIds: [], referralIds: [] };
  const { data: partners } = await service.from("partners").select("id, user_id").in("user_id", userIds);
  const partnerIds = (partners || []).map((p) => p.id);
  let referralIds = [];
  if (userIds.length) {
    const filters = [`referred_user_id.in.(${userIds.join(",")})`];
    if (partnerIds.length) filters.push(`partner_id.in.(${partnerIds.join(",")})`);
    const { data: referrals } = await service.from("partner_referrals").select("id").or(filters.join(","));
    referralIds = (referrals || []).map((r) => r.id);
  }
  return {
    userIds,
    partnerIds: [...new Set([...partnerIds, ...(await discoverR8PartnerIdsFromCommissions(service, { sinceIso }))])],
    referralIds,
  };
}

/** Scoped cleanup for active R8 fixtures — canonical reversal only, no ledger DELETE. */
export async function purgeActiveR8StagingFixturesScoped(service, report = {}, options = {}) {
  await clearStagingFailureFlags(service);
  report.ruleBaseline = await ensureR8CommissionRuleBaseline(service);
  const sinceIso =
    options.sinceIso || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const discovered = options.partnerIds?.length
    ? { userIds: [], partnerIds: [...new Set(options.partnerIds)], referralIds: [] }
    : await discoverActiveR8FixturePartnerIds(service, { sinceIso });
  report.discovered = {
    users: discovered.userIds.length,
    partners: discovered.partnerIds.length,
    referrals: discovered.referralIds.length,
  };
  if (!discovered.partnerIds.length) {
    report.skipped = true;
    report.reason = "no_active_r8_partners";
    return report;
  }
  report.commissionReversal = await reverseR8FixtureCommissionsEconomically(service, {
    partnerIds: discovered.partnerIds,
    sinceIso,
    idempotencyLike: options.idempotencyLike || null,
    reason: options.reason || "r8_scoped_pregate_cleanup",
  });
  report.purgeRpc = await purgeRunCommissionsFiltered(service, discovered.partnerIds, {
    sinceIso,
    idempotencyLike: options.idempotencyLike || null,
  });
  return report;
}

export async function assertScenarioFixtureBaseline(service, fx, scenarioId = "") {
  const issues = [];
  const { data: partnerA } = await service
    .from("partners")
    .select("id, tier_key, status")
    .eq("id", fx.partnerAId)
    .maybeSingle();
  if (partnerA?.tier_key !== "partner") {
    issues.push(`partnerA_tier=${partnerA?.tier_key}`);
    await ensurePartnerTierBaseline(service, fx.partnerAId, "partner");
  }
  const { data: qual } = await service
    .from("partner_referral_qualifications")
    .select("state")
    .eq("referral_id", fx.refQualifiedId)
    .maybeSingle();
  if (!qual?.state) issues.push("missing_qualification_row");
  const { data: profile } = await service
    .from("profiles")
    .select("human_verification_status, effective_user_classification")
    .eq("id", fx.referredQualifiedId)
    .maybeSingle();
  if (profile?.human_verification_status !== "verified") {
    issues.push(`hv=${profile?.human_verification_status}`);
    await setRealVerifiedProfile(service, fx.referredQualifiedId, { email: fx.emails.referredQualified });
  }
  if (profile?.effective_user_classification !== "real") {
    issues.push(`classification=${profile?.effective_user_classification}`);
    await setRealVerifiedProfile(service, fx.referredQualifiedId, { email: fx.emails.referredQualified });
  }
  const { count: highFraudCount } = await service
    .from("partner_fraud_assessments")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", fx.partnerAId)
    .eq("referral_id", fx.refQualifiedId)
    .in("risk_level", ["HIGH", "BLOCKED"]);
  if (highFraudCount) issues.push(`fraud_residue=${highFraudCount}`);
  if (issues.length) {
    throw new Error(`fixture_baseline_${scenarioId}:${issues.join(",")}`);
  }
  return { ok: true };
}

export async function initFixturePool(service, runId, authStats = null) {
  const password = process.env.STAGING_IAM_TEST_PASSWORD || "StagingTestPass!2026";
  const tag = `r8_${runId}`;
  const emails = buildR8CoreFixtureEmails();

  await purgeOrphanAuthIdentitiesForEmails(Object.values(emails)).catch(() => null);

  const meta = { r8_fixture: true, run_id: runId };
  const superAdminId = await ensureUser(service, emails.superAdmin, password, meta, authStats);
  const rewardsReadId = await ensureUser(service, emails.rewardsRead, password, meta, authStats);
  const rewardsManageId = await ensureUser(service, emails.rewardsManage, password, meta, authStats);
  const partnerAUserId = await ensureUser(service, emails.partnerA, password, meta, authStats);
  const partnerBUserId = await ensureUser(service, emails.partnerB, password, meta, authStats);
  const unauthorizedId = await ensureUser(service, emails.unauthorized, password, meta, authStats);
  const referredVerifiedId = await ensureUser(service, emails.referredVerified, password, meta, authStats);
  const referredQualifiedId = await ensureUser(service, emails.referredQualified, password, meta, authStats);
  const referredInvalidId = await ensureUser(service, emails.referredInvalid, password, meta, authStats);
  const partnerFraudHighUserId = await ensureUser(service, emails.partnerFraudHigh, password, meta, authStats);
  const referredFraudHighId = await ensureUser(service, emails.referredFraudHigh, password, meta, authStats);

  for (const [userId, email] of [
    [referredVerifiedId, emails.referredVerified],
    [referredQualifiedId, emails.referredQualified],
    [referredInvalidId, emails.referredInvalid],
    [referredFraudHighId, emails.referredFraudHigh],
  ]) {
    await setRealVerifiedProfile(service, userId, { email, runTag: runId });
    await ensureUniqueProfileEmailOwner(service, userId, email);
  }

  await service.from("profiles").upsert([
    { id: superAdminId, email: emails.superAdmin, role: "admin" },
    { id: rewardsReadId, email: emails.rewardsRead, role: "user" },
    { id: rewardsManageId, email: emails.rewardsManage, role: "user" },
    { id: partnerAUserId, email: emails.partnerA, role: "user" },
    { id: partnerBUserId, email: emails.partnerB, role: "user" },
    { id: unauthorizedId, email: emails.unauthorized, role: "user" },
    { id: partnerFraudHighUserId, email: emails.partnerFraudHigh, role: "user" },
  ]);

  await ensureIamRole(service, "r8_rewards_read", "R8 Rewards Read", [
    "dashboard.read",
    "partners.rewards.read",
  ]);
  await ensureIamRole(service, "r8_rewards_manage", "R8 Rewards Manage", [
    "dashboard.read",
    "partners.rewards.read",
    "partners.rewards.manage",
  ]);

  const iamSnapshot = { assignmentsByUser: {} };
  await assignRole(service, superAdminId, "admin", iamSnapshot);
  await assignRole(service, rewardsReadId, "r8_rewards_read", iamSnapshot);
  await assignRole(service, rewardsManageId, "r8_rewards_manage", iamSnapshot);

  const mkPartner = async (userId, code, tierKey = "partner") => {
    const { data: existing } = await service.from("partners").select("id").eq("user_id", userId).maybeSingle();
    if (existing?.id) {
      await service
        .from("partners")
        .update({ tier_key: tierKey, referral_code: code, status: "active" })
        .eq("id", existing.id);
      return existing.id;
    }
    const { data, error } = await service
      .from("partners")
      .insert({ user_id: userId, referral_code: code, status: "active", tier_key: tierKey })
      .select("id")
      .single();
    if (error?.code === "23505") {
      const ex = await service.from("partners").select("id").eq("user_id", userId).single();
      await service.from("partners").update({ tier_key: tierKey, referral_code: code, status: "active" }).eq("id", ex.data.id);
      return ex.data.id;
    }
    if (error) throw error;
    return data.id;
  };

  const partnerAId = await mkPartner(partnerAUserId, `R8A${runId.slice(-6)}`, "partner");
  const partnerBId = await mkPartner(partnerBUserId, `R8B${runId.slice(-6)}`, "partner");
  await ensurePartnerTierBaseline(service, partnerAId, "partner");
  await ensurePartnerTierBaseline(service, partnerBId, "partner");

  const mkReferral = async (partnerId, referredUserId, code, label) => {
    const { data: ref, error } = await service
      .from("partner_referrals")
      .insert({
        partner_id: partnerId,
        referred_user_id: referredUserId,
        referral_code: code,
        referred_username: label,
        status: "registered",
      })
      .select("id")
      .single();
    if (error?.code === "23505") {
      const ex = await service.from("partner_referrals").select("id").eq("referred_user_id", referredUserId).single();
      await service.from("partner_referral_qualifications").delete().eq("referral_id", ex.data.id);
      await initializeReferralQualification(service, { partnerId, referralId: ex.data.id, referredUserId });
      return ex.data.id;
    }
    if (error) throw error;
    await service.from("partner_referral_attributions").upsert({
      partner_id: partnerId,
      referral_id: ref.id,
      referred_user_id: referredUserId,
      referral_code: code,
      policy: "first_touch",
    });
    await initializeReferralQualification(service, { partnerId, referralId: ref.id, referredUserId });
    return ref.id;
  };

  const refVerifiedId = await mkReferral(partnerAId, referredVerifiedId, `R8V${runId.slice(-5)}`, "verified");
  const refQualifiedId = await mkReferral(partnerAId, referredQualifiedId, `R8Q${runId.slice(-5)}`, "qualified");
  await setQualState(service, refQualifiedId, partnerAId, QUALIFICATION_STATES.QUALIFIED);
  const refInvalidId = await mkReferral(partnerAId, referredInvalidId, `R8I${runId.slice(-5)}`, "invalid");

  const partnerFraudHighId = await mkPartner(partnerFraudHighUserId, `R8FH${runId.slice(-6)}`, "partner");
  const refFraudHighId = await mkReferral(
    partnerFraudHighId,
    referredFraudHighId,
    `R8FH${runId.slice(-5)}`,
    "fraud-high"
  );
  await setQualState(service, refFraudHighId, partnerFraudHighId, QUALIFICATION_STATES.QUALIFIED);

  return {
    runId,
    tag,
    password,
    emails,
    iamSnapshot,
    superAdminId,
    rewardsReadId,
    rewardsManageId,
    partnerAUserId,
    partnerBUserId,
    unauthorizedId,
    partnerAId,
    partnerBId,
    referredVerifiedId,
    referredQualifiedId,
    referredInvalidId,
    refVerifiedId,
    refQualifiedId,
    refInvalidId,
    partnerFraudHighId,
    partnerFraudHighUserId,
    referredFraudHighId,
    refFraudHighId,
    cleanupIds: {
      partnerIds: [partnerAId, partnerBId, partnerFraudHighId],
      referralIds: [refVerifiedId, refQualifiedId, refInvalidId, refFraudHighId],
      userIds: [
        referredVerifiedId,
        referredQualifiedId,
        referredInvalidId,
        referredFraudHighId,
      ],
      fraudReferralIds: [refFraudHighId],
    },
  };
}

export async function setQualState(service, referralId, partnerId, toState) {
  await transitionReferralQualification(service, { referralId, partnerId, toState, reason: "r8" });
}

let _activeCommissionRegistry = null;
let _activeCommissionTrace = null;

export function setCommissionRegistry(registry, { trace = false } = {}) {
  _activeCommissionRegistry = registry || null;
  _activeCommissionTrace = trace ? (registry.commissionTrace ||= []) : null;
}

export function clearCommissionRegistry() {
  _activeCommissionRegistry = null;
  _activeCommissionTrace = null;
}

export async function balanceRestoreMarkerExistsForCommission(service, commissionId) {
  const idempotencyKey = `${BALANCE_RESTORE_IDEMPOTENCY_PREFIX}:${commissionId}`;
  const { count, error } = await service
    .from("partner_service_commission_reversals")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", idempotencyKey);
  if (error) throw error;
  return (count || 0) > 0;
}

export async function computePartnerPendingGhostExposure(
  service,
  partnerId,
  { baselinePending = 0 } = {}
) {
  const partner = await partnerBalances(service, partnerId);
  const { data: rows, error } = await service
    .from("partner_commissions")
    .select("id, status, amount, amount_reversed, source_type")
    .eq("partner_id", partnerId);
  if (error) throw error;
  let activeExposure = 0;
  for (const row of rows || []) {
    if (row.source_type === "signup_bonus") continue;
    const activeAmount = roundMoney(
      Math.max(0, Number(row.amount || 0) - Number(row.amount_reversed || 0))
    );
    const economicallyActive =
      !["reversed", "rejected"].includes(String(row.status || "")) && activeAmount > 0;
    if (economicallyActive) activeExposure += activeAmount;
  }
  return roundMoney(
    Math.max(
      0,
      Number(partner.balance_pending || 0) - Number(baselinePending || 0) - activeExposure
    )
  );
}

export async function computePartnerEarningsGhostExposure(
  service,
  partnerId,
  { baselineEarnings = 0 } = {}
) {
  const partner = await partnerBalances(service, partnerId);
  const { data: rows, error } = await service
    .from("partner_commissions")
    .select("id, status, amount, amount_reversed, source_type")
    .eq("partner_id", partnerId);
  if (error) throw error;
  let activeExposure = 0;
  for (const row of rows || []) {
    if (row.source_type === "signup_bonus") continue;
    const activeAmount = roundMoney(
      Math.max(0, Number(row.amount || 0) - Number(row.amount_reversed || 0))
    );
    const economicallyActive =
      !["reversed", "rejected"].includes(String(row.status || "")) && activeAmount > 0;
    if (economicallyActive) activeExposure += activeAmount;
  }
  return roundMoney(
    Math.max(
      0,
      Number(partner.total_earnings || 0) - Number(baselineEarnings || 0) - activeExposure
    )
  );
}

export async function inspectServiceCommissionEconomicState(
  service,
  { commissionId, partnerId = null, partnerBaseline = null } = {}
) {
  const exposure = await computeCommissionEconomicExposure(service, commissionId);
  if (!exposure.exists) {
    return {
      commissionId,
      exists: false,
      balanceRestorationProven: true,
      pendingExposureExpected: 0,
      earningsExposureExpected: 0,
    };
  }

  const commission = exposure.commission;
  const resolvedPartnerId = partnerId || commission.partner_id;
  const amount = roundMoney(commission.amount);
  const amountReversed = roundMoney(commission.amount_reversed);
  const fullyReversed =
    commission.status === "reversed" ||
    commission.status === "rejected" ||
    (amount > 0 && amountReversed >= amount);
  const balanceRestoreMarkerExists = await balanceRestoreMarkerExistsForCommission(service, commissionId);
  const ledgerCredit = await findLedgerCreditForCommission(service, commissionId);
  const { data: ledgerRows, error: ledgerErr } = await service
    .from("partner_financial_ledger_entries")
    .select("id, entry_direction, amount, idempotency_key, reverses_entry_id, created_at")
    .eq("legacy_commission_id", commissionId)
    .order("created_at", { ascending: true });
  if (ledgerErr) throw ledgerErr;
  const ledgerDebitRows = (ledgerRows || []).filter((row) => row.entry_direction === "debit");
  const { data: reversals, error: revErr } = await service
    .from("partner_service_commission_reversals")
    .select("id, idempotency_key, refund_event_id, reversal_amount, ledger_entry_id, created_at")
    .eq("commission_id", commissionId)
    .order("created_at", { ascending: true });
  if (revErr) throw revErr;
  const canonicalReversal = (reversals || []).find(
    (row) =>
      String(row.refund_event_id || "") !== "balance_restore_only" &&
      String(row.idempotency_key || "").includes("service_commission_refund:")
  );

  let pendingExposureExpected = 0;
  let earningsExposureExpected = 0;
  if (exposure.economicallyActive) {
    pendingExposureExpected = exposure.activeAmount;
    earningsExposureExpected = exposure.activeAmount;
  } else if (fullyReversed && Math.abs(exposure.ledgerNet) <= 0.001 && !balanceRestoreMarkerExists) {
    const pendingGhost = resolvedPartnerId
      ? await computePartnerPendingGhostExposure(service, resolvedPartnerId, {
          baselinePending: partnerBaseline?.balance_pending ?? 0,
        })
      : 0;
    const earningsGhost = resolvedPartnerId
      ? await computePartnerEarningsGhostExposure(service, resolvedPartnerId, {
          baselineEarnings: partnerBaseline?.total_earnings ?? 0,
        })
      : 0;
    pendingExposureExpected = roundMoney(Math.min(amount, pendingGhost));
    earningsExposureExpected = roundMoney(Math.min(amount, earningsGhost));
  }

  const balanceRestorationProven =
    balanceRestoreMarkerExists ||
    (fullyReversed && Math.abs(exposure.ledgerNet) <= 0.001 && pendingExposureExpected < 0.001);

  return {
    commissionId,
    exists: true,
    partnerId: resolvedPartnerId,
    commission,
    activeAmount: exposure.activeAmount,
    economicallyActive: exposure.economicallyActive,
    fullyReversed,
    ledgerCredit,
    ledgerDebitRows,
    ledgerNet: exposure.ledgerNet,
    canonicalReversalExists: Boolean(canonicalReversal?.id),
    canonicalReversal: canonicalReversal || null,
    balanceRestoreMarkerExists,
    pendingExposureExpected,
    earningsExposureExpected,
    balanceRestorationProven,
  };
}

async function harnessCloseReversedCommissionBalanceIfRequired(
  service,
  commissionId,
  reason,
  { partnerBaselines = null } = {}
) {
  const restore = await restorePartnerServiceCommissionBalanceAfterLedgerNetZero(service, commissionId, {
    reason,
  });
  if (restore.outcome === "restored") return restore;

  const { data: commission, error } = await service
    .from("partner_commissions")
    .select("id, partner_id, amount, amount_reversed, status, source_type, is_withdrawable")
    .eq("id", commissionId)
    .maybeSingle();
  if (error) throw error;
  if (!commission?.id || commission.source_type === "signup_bonus") return restore;
  if (commission.status !== "reversed" && commission.status !== "rejected") return restore;

  const economicState = await inspectServiceCommissionEconomicState(service, {
    commissionId,
    partnerId: commission.partner_id,
    partnerBaseline: partnerBaselines?.[commission.partner_id] || null,
  });
  if (economicState.balanceRestorationProven) {
    return {
      outcome: "already_restored",
      commissionId,
      via: economicState.balanceRestoreMarkerExists
        ? "balance_restore_marker"
        : "economic_state_proven",
      economicState,
    };
  }

  const ledgerNet = economicState.ledgerNet;
  if (Math.abs(ledgerNet) > 0.001) return restore;

  const restoreAmount = roundMoney(commission.amount);
  if (restoreAmount <= 0) return restore;
  if (economicState.pendingExposureExpected + 0.001 < restoreAmount) {
    return {
      outcome: "already_restored",
      commissionId,
      via: "no_pending_ghost_exposure",
      economicState,
    };
  }

  const { data: partner, error: partnerErr } = await service
    .from("partners")
    .select("balance_pending, balance_bonus_pending, balance_withdrawable, total_earnings")
    .eq("id", commission.partner_id)
    .maybeSingle();
  if (partnerErr) throw partnerErr;

  const bucket = "pending";
  const bucketBalance =
    bucket === "withdrawable"
      ? Number(partner?.balance_withdrawable || 0)
      : bucket === "bonus_pending"
        ? Number(partner?.balance_bonus_pending || 0)
        : Number(partner?.balance_pending || 0);
  if (roundMoney(bucketBalance) < restoreAmount) {
    return { outcome: "no_balance_exposure", commissionId, restoreAmount, bucketBalance: roundMoney(bucketBalance) };
  }

  await restorePartnerBalancesAfterLedgerCreditReversal(service, {
    partnerId: commission.partner_id,
    amount: restoreAmount,
    balanceBucket: bucket,
  });
  const idempotencyKey = `${BALANCE_RESTORE_IDEMPOTENCY_PREFIX}:${commissionId}`;
  const { error: markerError } = await service.from("partner_service_commission_reversals").insert({
    commission_id: commissionId,
    refund_event_id: "balance_restore_only",
    reversal_amount: restoreAmount,
    original_commission_amount: restoreAmount,
    reason,
    ledger_entry_id: null,
    idempotency_key: idempotencyKey,
  });
  if (markerError && markerError.code !== "23505") throw markerError;
  return { outcome: "restored", commissionId, via: "harness_canonical_balance_close", amount: restoreAmount, bucket };
}

export async function reverseCommissionsByIds(
  service,
  commissionIds,
  { reason = "r8_commission_id_cleanup", partnerBaselines = null } = {}
) {
  const ids = [...new Set((commissionIds || []).filter(Boolean))];
  const report = {
    reversed: 0,
    skipped: 0,
    alreadyReversed: 0,
    balanceRestored: 0,
    alreadyRestored: 0,
    errors: [],
  };
  for (const commissionId of ids) {
    const { data: commission, error } = await service
      .from("partner_commissions")
      .select("id, status, source_type, partner_id, amount, amount_reversed")
      .eq("id", commissionId)
      .maybeSingle();
    if (error) throw error;
    if (!commission?.id) continue;
    if (commission.source_type === "signup_bonus") {
      report.skipped += 1;
      continue;
    }
    const activeAmount = roundMoney(
      Math.max(0, Number(commission.amount || 0) - Number(commission.amount_reversed || 0))
    );
    const economicallyActive =
      !["reversed", "rejected"].includes(String(commission.status || "")) && activeAmount > 0;
    if (!economicallyActive) {
      if (commission.status === "reversed" || commission.status === "rejected") {
        const restore = await harnessCloseReversedCommissionBalanceIfRequired(service, commissionId, reason, {
          partnerBaselines,
        });
        if (restore.outcome === "restored") report.balanceRestored += 1;
        else report.alreadyRestored += 1;
      } else {
        report.skipped += 1;
      }
      continue;
    }
    try {
      const ledger = await findLedgerCreditForCommission(service, commission.id);
      const already = ledger?.id ? await ledgerCreditAlreadyReversed(service, ledger.id) : false;
      if (already) {
        await reversePartnerServiceCommissionLedgerAlreadyReversed(service, commission.id, {
          reason,
          ledgerEntryId: ledger?.id,
        });
      } else {
        await reversePartnerServiceCommissionAtomic(service, {
          commissionId: commission.id,
          reason,
        });
      }
      const exposure = await computeCommissionEconomicExposure(service, commission.id);
      if (exposure.hasExposure) {
        await ensureCommissionsEconomicallyNeutralBeforePurge(service, [commission.id], `${reason}_retry`, {
          partnerBaselines,
        });
        const retryExposure = await computeCommissionEconomicExposure(service, commission.id);
        if (retryExposure.hasExposure) {
          throw new Error(
            `registry_commission_still_exposed:${commission.id}:${JSON.stringify({
              status: retryExposure.commission?.status,
              activeAmount: retryExposure.activeAmount,
              ledgerNet: retryExposure.ledgerNet,
            })}`
          );
        }
      }
      report.reversed += 1;
    } catch (err) {
      report.errors.push({ commissionId: commission.id, message: String(err?.message || err) });
    }
  }
  if (report.errors.length) {
    throw new Error(`reverse_commissions_failed:${JSON.stringify(report.errors.slice(0, 5))}`);
  }
  return report;
}

export async function createCommissionRpc(service, fx, opts) {
  const sourceId = toCommissionSourceId(opts.sourceId);
  const runTag = fx.runId || fx.runTag || "";
  const idem =
    opts.idempotencyKey ||
    ["r8", runTag, fx.partnerId, fx.referredUserId, opts.serviceType, sourceId].filter(Boolean).join(":");
  const result = await service.rpc("create_partner_commission_atomic", {
    p_partner_id: fx.partnerId,
    p_referral_id: fx.referralId,
    p_referred_user_id: fx.referredUserId,
    p_service_type: opts.serviceType,
    p_source_id: sourceId,
    p_base_amount: opts.baseAmount,
    p_commission_percent: opts.commissionPercent ?? 10,
    p_reason: opts.reason || "r8 test",
    p_initial_status: opts.initialStatus || "pending_activation",
    p_invited_username: "r8",
    p_idempotency_key: idem,
    p_source_type: opts.sourceType || "service",
    p_entitlement_id: opts.entitlementId ?? null,
  });
  const commissionId = result?.data?.commission_id;
  if (commissionId && _activeCommissionRegistry?.commissionIds) {
    if (!_activeCommissionRegistry.commissionIds.includes(commissionId)) {
      _activeCommissionRegistry.commissionIds.push(commissionId);
    }
  }
  if (commissionId && _activeCommissionTrace) {
    _activeCommissionTrace.push({
      scenarioId: opts.scenarioId || null,
      commissionId,
      partnerId: fx.partnerId,
      idempotencyKey: idem,
      sourceId,
      serviceType: opts.serviceType || "service",
      sourceType: opts.sourceType || "service",
      createdAt: new Date().toISOString(),
    });
  }
  return result;
}

export async function upsertEntitlement(service, fx, opts) {
  const sourceId = toCommissionSourceId(opts.sourceId);
  const idem = `entitlement:${fx.partnerId}:${fx.referredUserId}:${opts.serviceType}:${sourceId}:${fx.runId || ""}`;
  return service.from("partner_service_commission_entitlements").upsert({
    partner_id: fx.partnerId,
    referral_id: fx.referralId,
    referred_user_id: fx.referredUserId,
    service_type: opts.serviceType,
    source_id: sourceId,
    base_amount: opts.baseAmount,
    calculated_amount: opts.amount,
    status: "pending_qualification",
    idempotency_key: idem,
    commercial_snapshot: {
      base_amount: opts.baseAmount,
      calculated_amount: opts.amount,
      service_type: opts.serviceType,
    },
  }).select("id, status").single();
}

export async function mkTierPartner(service, runId, tierKey) {
  const password = process.env.STAGING_IAM_TEST_PASSWORD || "StagingTestPass!2026";
  const runTag = String(runId).replace(/[^a-zA-Z0-9]/g, "").slice(-10) || "r8tier";
  const domain = getR8FixtureDomain();
  const email = `r8-tier-${tierKey}-${runTag}@${domain}`;
  const userId = await ensureUser(service, email, password, { r8_tier: tierKey, run_id: runId });
  const code = `R8T${tierKey.slice(0, 2).toUpperCase()}${runTag.slice(-4)}`;
  const partnerId = await (async () => {
    const { data, error } = await service
      .from("partners")
      .insert({ user_id: userId, referral_code: code, status: "active", tier_key: tierKey })
      .select("id")
      .single();
    if (error?.code === "23505") {
      const ex = await service.from("partners").select("id").eq("user_id", userId).single();
      await service.from("partners").update({ tier_key: tierKey }).eq("id", ex.data.id);
      return ex.data.id;
    }
    if (error) throw error;
    return data.id;
  })();
  const referredEmail = `r8-tier-ref-${tierKey}-${runTag}@${domain}`;
  const referredUserId = await ensureUser(service, referredEmail, password, { r8_tier_ref: tierKey });
  const { data: ref, error: refError } = await service
    .from("partner_referrals")
    .insert({
      partner_id: partnerId,
      referred_user_id: referredUserId,
      referral_code: code,
      referred_username: tierKey,
      status: "registered",
    })
    .select("id")
    .single();
  let referralId = ref?.id;
  if (refError?.code === "23505") {
    const ex = await service.from("partner_referrals").select("id").eq("referred_user_id", referredUserId).single();
    referralId = ex.data.id;
    await service.from("partner_referral_qualifications").delete().eq("referral_id", referralId);
  } else if (refError) {
    throw refError;
  }
  await initializeReferralQualification(service, { partnerId, referralId, referredUserId });
  await setQualState(service, referralId, partnerId, QUALIFICATION_STATES.QUALIFIED);
  return { partnerId, referralId, referredUserId, tierKey, runId, runTag: runId };
}

export function initFixtureRegistry() {
  return {
    tierPartnerIds: [],
    commissionIds: [],
    commissionTrace: [],
    hookCommissionRecords: [],
    subscriptionIds: [],
  };
}

export function getRegistryOwnedCommissionIds(registry) {
  const hookIds = (registry?.hookCommissionRecords || []).map((row) => row.commissionId);
  return [...new Set([...(registry?.commissionIds || []), ...hookIds].filter(Boolean))];
}

export async function registerCommissionCreatedByProductHook(
  service,
  {
    scenarioId,
    runId,
    partnerId,
    sourceType = null,
    sourceId = null,
    serviceType = null,
    createdAfter,
    expectedAmount = null,
    referralId = null,
    referredUserId = null,
  } = {}
) {
  if (!_activeCommissionRegistry) {
    throw new Error("R8_HOOK_REGISTRY_NOT_ACTIVE");
  }
  if (!partnerId || !createdAfter) {
    throw new Error("R8_HOOK_REGISTRY_MISSING_SCOPE");
  }

  let query = service
    .from("partner_commissions")
    .select(
      "id, partner_id, amount, amount_reversed, status, source_type, source_id, idempotency_key, created_at"
    )
    .eq("partner_id", partnerId)
    .gte("created_at", createdAfter)
    .order("created_at", { ascending: true });
  if (sourceType) query = query.eq("source_type", sourceType);
  if (sourceId != null) query = query.eq("source_id", String(sourceId));
  const { data: rows, error } = await query;
  if (error) throw error;

  let matches = rows || [];
  if (serviceType) {
    matches = matches.filter((row) => String(row.idempotency_key || "").includes(String(serviceType)));
  }
  if (referredUserId) {
    matches = matches.filter((row) => String(row.idempotency_key || "").includes(String(referredUserId)));
  }
  if (referralId) {
    matches = matches.filter((row) => String(row.idempotency_key || "").includes(String(referralId)));
  }
  if (expectedAmount != null) {
    matches = matches.filter(
      (row) => roundMoney(Number(row.amount || 0)) === roundMoney(Number(expectedAmount))
    );
  }

  if (!matches.length) {
    throw new Error(
      `R8_HOOK_COMMISSION_NOT_FOUND:${scenarioId}:${JSON.stringify({
        partnerId,
        sourceType,
        sourceId,
        serviceType,
        createdAfter,
        expectedAmount,
      })}`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `R8_HOOK_COMMISSION_AMBIGUOUS:${scenarioId}:${JSON.stringify({
        partnerId,
        sourceType,
        sourceId,
        serviceType,
        createdAfter,
        matches: matches.map((row) => ({
          commissionId: row.id,
          sourceId: row.source_id,
          idempotencyKey: row.idempotency_key,
          createdAt: row.created_at,
        })),
      })}`
    );
  }

  const commission = matches[0];
  if (!_activeCommissionRegistry.commissionIds.includes(commission.id)) {
    _activeCommissionRegistry.commissionIds.push(commission.id);
  }
  _activeCommissionRegistry.hookCommissionRecords ||= [];
  const record = {
    scenarioId,
    runId,
    commissionId: commission.id,
    partnerId: commission.partner_id,
    sourceId: commission.source_id,
    sourceType: commission.source_type,
    idempotencyKey: commission.idempotency_key,
    createdAt: commission.created_at,
    registeredAt: new Date().toISOString(),
  };
  if (!_activeCommissionRegistry.hookCommissionRecords.some((row) => row.commissionId === commission.id)) {
    _activeCommissionRegistry.hookCommissionRecords.push(record);
  }
  if (_activeCommissionTrace) {
    _activeCommissionTrace.push({
      scenarioId,
      commissionId: commission.id,
      partnerId: commission.partner_id,
      idempotencyKey: commission.idempotency_key,
      sourceId: commission.source_id,
      sourceType: commission.source_type,
      serviceType: serviceType || null,
      createdAt: commission.created_at,
      via: "product_hook",
    });
  }
  return { ...commission, record };
}

export function trackTierPartner(registry, tfx) {
  if (tfx?.partnerId && !registry.tierPartnerIds.includes(tfx.partnerId)) {
    registry.tierPartnerIds.push(tfx.partnerId);
  }
}

export async function snapshotVipSignalRule(service) {
  const { data } = await service
    .from("partner_commission_rules")
    .select("*")
    .eq("service_type", "vip_signal")
    .eq("status", "active")
    .maybeSingle();
  return data;
}

export async function restoreVipSignalRule(service, sessions, snapshot, baseUrl) {
  if (!snapshot?.tier_policy) return { restored: false };
  const put = await adminApi(baseUrl, sessions.superAdmin.cookie, "PUT", {
    serviceType: "vip_signal",
    tierPolicy: snapshot.tier_policy,
    commissionPercent: Number(snapshot.commission_percent),
    reason: "r8 restore vip_signal rule",
  });
  await service
    .from("partner_commission_rules")
    .update({
      tier_policy: snapshot.tier_policy,
      commission_percent: Number(snapshot.commission_percent),
      is_enabled: snapshot.is_enabled ?? true,
      is_active: snapshot.is_active ?? true,
    })
    .eq("service_type", "vip_signal")
    .eq("status", "active");
  return { restored: put.status >= 200 && put.status < 300, tierPolicy: snapshot.tier_policy };
}

export async function clearStagingFailureFlags(service) {
  try {
    return await resetPartnerCenterStagingTestFlags(service);
  } catch {
    /* staging-only optional */
    return { remaining: null, skipped: true };
  }
}

/** Delete all transient staging failure-injection flags; fail closed if residue remains. */
export async function resetPartnerCenterStagingTestFlags(service) {
  const { error } = await service.from("partner_center_staging_test_flags").delete().neq("flag_key", "");
  if (error) throw new Error(`R8_FLAG_RESET_FAILED:delete:${error.message}`);
  const { count, error: countErr } = await service
    .from("partner_center_staging_test_flags")
    .select("flag_key", { count: "exact", head: true });
  if (countErr) throw new Error(`R8_FLAG_RESET_FAILED:count:${countErr.message}`);
  if ((count || 0) !== 0) {
    throw new Error(`R8_FLAG_RESET_FAILED:remaining=${count}`);
  }
  return { remaining: 0 };
}

export async function armStagingFailureInjection(service, kind, value = "commission") {
  const key = kind === "reverse" ? "reverse_fail_after" : "create_fail_after";
  const { error } = await service.from("partner_center_staging_test_flags").upsert(
    {
      flag_key: key,
      flag_value: String(value),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "flag_key" }
  );
  if (error) throw error;
}

export async function insertSubscription(service, { userEmail, price, status = "مفعل", runTag }) {
  const { data, error } = await service
    .from("subscription_requests")
    .insert({
      user_email: userEmail,
      username: "r8user",
      plan_name: "R8 Test Plan",
      category: "باقات VIP",
      price,
      status,
      payment_proof_path: `r8/${runTag}/proof.png`,
      payment_proof_uploaded_at: new Date().toISOString(),
    })
    .select("id, price")
    .single();
  if (error) throw error;
  return data;
}

export async function snapshotFinancialBaseline(service) {
  const [partners, commissions, ledger, entitlements] = await Promise.all([
    service.from("partners").select("id, balance_pending, balance_withdrawable, total_earnings"),
    service.from("partner_commissions").select("id", { count: "exact", head: true }),
    service.from("partner_financial_ledger_entries").select("id", { count: "exact", head: true }),
    service.from("partner_service_commission_entitlements").select("id", { count: "exact", head: true }),
  ]);
  return {
    partnerRows: partners.data || [],
    commissionCount: commissions.count || 0,
    ledgerCount: ledger.count || 0,
    entitlementCount: entitlements.count || 0,
  };
}

export async function invalidateEntitlementPending(service, { entitlementId, sourceId, serviceType }) {
  if (entitlementId) {
    const { data } = await service
      .from("partner_service_commission_entitlements")
      .update({ status: "reversed", updated_at: new Date().toISOString() })
      .eq("id", entitlementId)
      .eq("status", "pending_qualification")
      .select("id");
    return { invalidated: (data || []).length };
  }
  const { data } = await service
    .from("partner_service_commission_entitlements")
    .update({ status: "reversed", updated_at: new Date().toISOString() })
    .eq("source_id", String(sourceId))
    .eq("service_type", String(serviceType).toLowerCase())
    .eq("status", "pending_qualification")
    .select("id");
  return { invalidated: (data || []).length };
}

export async function captureRunStartedAt(service) {
  try {
    const res = runStagingSql(
      "SELECT (now() - interval '3 minutes')::timestamptz AS ts;",
      { optional: true }
    );
    const ts = res?.rows?.[0]?.ts;
    if (ts) return String(ts);
  } catch { /* fallback below */ }
  return new Date(Date.now() - 180_000).toISOString();
}

function purgeRunCommissionsSql(partnerIds, runStartedAt) {
  if (!partnerIds.length) return;
  const idsLiteral = [...new Set(partnerIds.filter(Boolean))]
    .map((id) => `'${String(id).replace(/'/g, "")}'::uuid`)
    .join(", ");
  const since = runStartedAt ? `'${String(runStartedAt).replace(/'/g, "")}'::timestamptz` : "NULL";
  runStagingSql(
    `SELECT public.partner_center_staging_purge_run_commissions(ARRAY[${idsLiteral}]::uuid[], ${since});`,
    { optional: true }
  );
}

async function deleteCommissionLedgerBundleForPurge(service, commissionIds) {
  const ids = [...new Set((commissionIds || []).filter(Boolean))];
  if (!ids.length) return { bundled: 0 };
  let bundled = 0;
  for (const commissionId of ids) {
    const credit = await findLedgerCreditForCommission(service, commissionId);
    if (credit?.id) {
      await service
        .from("partner_financial_ledger_entries")
        .delete()
        .eq("reverses_entry_id", credit.id);
      await service
        .from("partner_financial_ledger_entries")
        .delete()
        .eq("idempotency_key", `ledger:reversal:${credit.id}`);
      await service.from("partner_financial_ledger_entries").delete().eq("id", credit.id);
      bundled += 1;
    }
  }
  return { bundled };
}

async function listCommissionIdsForPurge(service, partnerIds, { sinceIso = null, idempotencyLike = null } = {}) {
  let query = service.from("partner_commissions").select("id").in("partner_id", partnerIds);
  if (sinceIso) query = query.gte("created_at", sinceIso);
  if (idempotencyLike) query = query.ilike("idempotency_key", idempotencyLike);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

async function ensureCommissionsEconomicallyNeutralBeforePurge(
  service,
  commissionIds,
  reason = "r8_purge_precondition",
  { partnerBaselines = null } = {}
) {
  const report = { reversed: 0, balanceRestored: 0, skipped: 0, errors: [] };
  for (const commissionId of [...new Set((commissionIds || []).filter(Boolean))]) {
    const { data: commission, error } = await service
      .from("partner_commissions")
      .select("id, status, source_type, amount, amount_reversed")
      .eq("id", commissionId)
      .maybeSingle();
    if (error) throw error;
    if (!commission?.id || commission.source_type === "signup_bonus") {
      report.skipped += 1;
      continue;
    }

    const activeAmount = roundMoney(
      Math.max(0, Number(commission.amount || 0) - Number(commission.amount_reversed || 0))
    );
    const economicallyActive =
      !["reversed", "rejected"].includes(String(commission.status || "")) && activeAmount > 0;
    const ledgerNet = await computeCommissionLedgerNet(service, commissionId);

    try {
      if (economicallyActive) {
        const ledger = await findLedgerCreditForCommission(service, commissionId);
        const already = ledger?.id ? await ledgerCreditAlreadyReversed(service, ledger.id) : false;
        if (already) {
          await reversePartnerServiceCommissionLedgerAlreadyReversed(service, commissionId, {
            reason,
            ledgerEntryId: ledger?.id,
          });
        } else {
          await reversePartnerServiceCommissionAtomic(service, { commissionId, reason });
        }
        report.reversed += 1;
        continue;
      }

      if (commission.status === "reversed" || commission.status === "rejected") {
        if (Math.abs(ledgerNet) > 0.001) {
          const ledger = await findLedgerCreditForCommission(service, commissionId);
          await reversePartnerServiceCommissionLedgerAlreadyReversed(service, commissionId, {
            reason,
            ledgerEntryId: ledger?.id,
          });
          report.reversed += 1;
          continue;
        }
        const restore = await harnessCloseReversedCommissionBalanceIfRequired(service, commissionId, reason, {
          partnerBaselines,
        });
        if (restore.outcome === "restored") report.balanceRestored += 1;
        else report.skipped += 1;
        continue;
      }

      if (Math.abs(ledgerNet) > 0.001) {
        await reversePartnerServiceCommissionAtomic(service, { commissionId, reason });
        report.reversed += 1;
        continue;
      }

      report.skipped += 1;
    } catch (err) {
      report.errors.push({ commissionId, message: String(err?.message || err) });
    }
  }
  if (report.errors.length) {
    throw new Error(`purge_precondition_failed:${JSON.stringify(report.errors.slice(0, 5))}`);
  }
  return report;
}

export async function capturePartnerATraceSnapshot(
  service,
  partnerId,
  label,
  { finBeforeIso = null, registryCommissionIds = [], focusCommissionIds = [] } = {}
) {
  const partner = await partnerBalances(service, partnerId);
  let query = service
    .from("partner_commissions")
    .select("id, amount, amount_reversed, status, source_type, source_id, idempotency_key, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true });
  if (finBeforeIso) query = query.gte("created_at", finBeforeIso);
  const { data: rows, error } = await query;
  if (error) throw error;

  const registrySet = new Set((registryCommissionIds || []).map(String));
  const focusSet = new Set((focusCommissionIds || []).map(String));
  const commissions = [];
  let activeCommissionExposure = 0;
  let ledgerNetSum = 0;

  for (const row of rows || []) {
    const exposure = await computeCommissionEconomicExposure(service, row.id);
    const { data: ledgerRows } = await service
      .from("partner_financial_ledger_entries")
      .select("id, entry_direction, amount, idempotency_key, reverses_entry_id, created_at")
      .eq("legacy_commission_id", row.id)
      .order("created_at", { ascending: true });
    const { data: reversals } = await service
      .from("partner_service_commission_reversals")
      .select("id, idempotency_key, refund_event_id, reversal_amount, created_at")
      .eq("commission_id", row.id)
      .order("created_at", { ascending: true });
    const balanceRestoreMarker = (reversals || []).some(
      (r) => String(r.refund_event_id || "") === "balance_restore_only"
    );
    commissions.push({
      commissionId: row.id,
      amount: Number(row.amount || 0),
      amountReversed: Number(row.amount_reversed || 0),
      status: row.status,
      sourceType: row.source_type,
      sourceId: row.source_id,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      inRegistry: registrySet.has(String(row.id)),
      focus: focusSet.has(String(row.id)),
      activeAmount: exposure.activeAmount,
      economicallyActive: exposure.economicallyActive,
      ledgerNet: exposure.ledgerNet,
      ledgerCreditId: exposure.ledgerCreditId,
      ledgerRows: ledgerRows || [],
      reversals: reversals || [],
      balanceRestoreMarker,
    });
    if (exposure.economicallyActive) activeCommissionExposure += exposure.activeAmount;
    ledgerNetSum += exposure.ledgerNet;
  }

  return {
    label,
    capturedAt: new Date().toISOString(),
    partnerId,
    partner,
    commissions,
    registryCommissionIds: [...registryCommissionIds],
    metrics: {
      activeCommissionExposure: roundMoney(activeCommissionExposure),
      ledgerNetSum: roundMoney(ledgerNetSum),
      commissionRowCount: (rows || []).length,
      registryRowCount: commissions.filter((c) => c.inRegistry).length,
    },
  };
}

export async function auditCommissionRegistry(registry, manifestEvidence = {}) {
  const ids = registry?.commissionIds || [];
  const unique = [...new Set(ids)];
  const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  const scenarioMap = manifestEvidence.scenarioByCommissionId || {};
  const missingScenarioCommissionIds = Object.entries({
    "R8-069": manifestEvidence.r80969CommissionId,
    "R8-070": manifestEvidence.r8070CommissionId,
    "R8-034": manifestEvidence.r8034CommissionId,
  })
    .filter(([, id]) => id && !ids.includes(id))
    .map(([scenarioId, id]) => ({ scenarioId, commissionId: id }));
  return {
    registryCommissionCount: ids.length,
    uniqueCommissionCount: unique.length,
    duplicateCommissionIds: [...new Set(duplicates)],
    missingScenarioCommissionIds,
    scenarioByCommissionId: scenarioMap,
  };
}

export async function traceCommissionLifecycle(service, commissionId) {
  const exposure = await computeCommissionEconomicExposure(service, commissionId);
  if (!exposure.exists) return { commissionId, exists: false };
  const { data: ledgerRows } = await service
    .from("partner_financial_ledger_entries")
    .select("id, entry_direction, amount, idempotency_key, reverses_entry_id, balance_bucket, created_at")
    .eq("legacy_commission_id", commissionId)
    .order("created_at", { ascending: true });
  const { data: reversals } = await service
    .from("partner_service_commission_reversals")
    .select("id, idempotency_key, refund_event_id, reversal_amount, ledger_entry_id, created_at")
    .eq("commission_id", commissionId)
    .order("created_at", { ascending: true });
  const balanceRestoreMarker = (reversals || []).some(
    (r) => String(r.refund_event_id || "") === "balance_restore_only"
  );
  const canonicalReversal = (reversals || []).find(
    (r) =>
      String(r.refund_event_id || "") !== "balance_restore_only" &&
      String(r.idempotency_key || "").includes("service_commission_refund:")
  );
  let partnerAfter = null;
  if (exposure.commission?.partner_id) {
    partnerAfter = await partnerBalances(service, exposure.commission.partner_id);
  }
  return {
    commissionId,
    exists: true,
    commission: exposure.commission,
    activeAmount: exposure.activeAmount,
    economicallyActive: exposure.economicallyActive,
    ledgerNet: exposure.ledgerNet,
    ledgerCreditId: exposure.ledgerCreditId,
    ledgerRows: ledgerRows || [],
    reversals: reversals || [],
    balanceRestoreMarker,
    canonicalReversal: canonicalReversal || null,
    partnerBalances: partnerAfter,
  };
}

export function analyzePartnerATraceTimeline(
  traces,
  { finBeforePartner = null, focusCommissionIds = [] } = {}
) {
  const focusSet = new Set((focusCommissionIds || []).map(String));
  let prevPartner = finBeforePartner
    ? {
        balance_pending: Number(finBeforePartner.balance_pending || 0),
        balance_bonus_pending: Number(finBeforePartner.balance_bonus_pending || 0),
        balance_withdrawable: Number(finBeforePartner.balance_withdrawable || 0),
        total_earnings: Number(finBeforePartner.total_earnings || 0),
        activeCommissionExposure: 0,
        ledgerNetSum: 0,
        commissionRowCount: 0,
      }
    : null;
  const transitions = [];
  let firstDivergence = null;

  for (const snap of traces || []) {
    const partner = snap.partner || {};
    const metrics = snap.metrics || {};
    const current = {
      balance_pending: Number(partner.balance_pending || 0),
      balance_bonus_pending: Number(partner.balance_bonus_pending || 0),
      balance_withdrawable: Number(partner.balance_withdrawable || 0),
      total_earnings: Number(partner.total_earnings || 0),
      activeCommissionExposure: Number(metrics.activeCommissionExposure || 0),
      ledgerNetSum: Number(metrics.ledgerNetSum || 0),
      commissionRowCount: Number(metrics.commissionRowCount || 0),
    };
    const delta = prevPartner
      ? {
          pending: roundMoney(current.balance_pending - prevPartner.balance_pending),
          bonusPending: roundMoney(current.balance_bonus_pending - prevPartner.balance_bonus_pending),
          withdrawable: roundMoney(current.balance_withdrawable - prevPartner.balance_withdrawable),
          earnings: roundMoney(current.total_earnings - prevPartner.total_earnings),
          activeCommissionExposure: roundMoney(current.activeCommissionExposure - prevPartner.activeCommissionExposure),
          ledgerNetSum: roundMoney(current.ledgerNetSum - prevPartner.ledgerNetSum),
          commissionRowCount: current.commissionRowCount - prevPartner.commissionRowCount,
        }
      : null;
    const focusCommissions = (snap.commissions || []).filter((c) => focusSet.has(String(c.commissionId)));
    const transition = {
      scenarioId: snap.scenarioId || snap.label,
      scenarioName: snap.scenarioName || snap.label,
      capturedAt: snap.capturedAt,
      status: snap.status || null,
      partner: current,
      delta,
      metrics: {
        activeCommissionExposure: current.activeCommissionExposure,
        ledgerNetSum: current.ledgerNetSum,
        commissionRowCount: current.commissionRowCount,
        registryRowCount: Number(metrics.registryRowCount || 0),
      },
      focusCommissions,
    };
    transitions.push(transition);

    if (!firstDivergence && prevPartner && delta) {
      const cumulativePending = roundMoney(current.balance_pending - Number(finBeforePartner?.balance_pending || 0));
      const cumulativeEarnings = roundMoney(current.total_earnings - Number(finBeforePartner?.total_earnings || 0));
      const exposureMismatch =
        Math.abs(cumulativePending - current.activeCommissionExposure) > 0.001 &&
        current.activeCommissionExposure >= 0;
      const ghostAfterReversal = focusCommissions.some(
        (c) =>
          ["reversed", "rejected"].includes(String(c.status || "")) &&
          Math.abs(Number(c.ledgerNet || 0)) <= 0.001 &&
          !c.balanceRestoreMarker &&
          Number(c.amount || 0) > 0
      );
      const unexplainedJump =
        Math.abs(delta.pending) > 0.001 ||
        Math.abs(delta.earnings) > 0.001 ||
        Math.abs(delta.activeCommissionExposure) > 0.001 ||
        Math.abs(delta.ledgerNetSum) > 0.001;
      if (unexplainedJump && (exposureMismatch || ghostAfterReversal || current.activeCommissionExposure > 0.001)) {
        firstDivergence = {
          scenarioId: snap.scenarioId || snap.label,
          capturedAt: snap.capturedAt,
          delta,
          cumulativePending,
          cumulativeEarnings,
          activeCommissionExposure: current.activeCommissionExposure,
          focusCommissionId: focusCommissions.find((c) => ghostAfterReversal && c.focus)?.commissionId || focusCommissions[0]?.commissionId || null,
          reason: ghostAfterReversal
            ? "reversed_commission_balance_not_closed"
            : exposureMismatch
              ? "partner_balance_exceeds_active_commission_exposure"
              : "active_commission_exposure_nonzero",
        };
      }
    }
    prevPartner = current;
  }

  return {
    partnerId: traces?.[0]?.partnerId || null,
    transitionCount: transitions.length,
    transitions,
    firstDivergence,
    finBeforePartner: finBeforePartner
      ? {
          balance_pending: Number(finBeforePartner.balance_pending || 0),
          balance_bonus_pending: Number(finBeforePartner.balance_bonus_pending || 0),
          balance_withdrawable: Number(finBeforePartner.balance_withdrawable || 0),
          total_earnings: Number(finBeforePartner.total_earnings || 0),
        }
      : null,
  };
}

export async function computeCommissionEconomicExposure(service, commissionId) {
  const { data: commission, error } = await service
    .from("partner_commissions")
    .select("id, partner_id, status, amount, amount_reversed, source_type, source_id, idempotency_key, created_at")
    .eq("id", commissionId)
    .maybeSingle();
  if (error) throw error;
  if (!commission?.id) {
    return { exists: false, hasExposure: false };
  }
  const activeAmount = roundMoney(
    Math.max(0, Number(commission.amount || 0) - Number(commission.amount_reversed || 0))
  );
  const economicallyActive =
    commission.source_type !== "signup_bonus" &&
    !["reversed", "rejected"].includes(String(commission.status || "")) &&
    activeAmount > 0;
  const ledgerNet = await computeCommissionLedgerNet(service, commissionId);
  const ledgerCredit = await findLedgerCreditForCommission(service, commissionId);
  return {
    exists: true,
    hasExposure: economicallyActive || Math.abs(ledgerNet) > 0.001,
    commission,
    activeAmount,
    economicallyActive,
    ledgerNet,
    ledgerCreditId: ledgerCredit?.id || null,
  };
}

export async function listCurrentRunOrphanCommissions(
  service,
  { partnerIds, sinceIso, registryCommissionIds = [] }
) {
  const uniquePartnerIds = [...new Set((partnerIds || []).filter(Boolean))];
  if (!uniquePartnerIds.length || !sinceIso) return [];
  const { data: rows, error } = await service
    .from("partner_commissions")
    .select("id, partner_id, status, amount, amount_reversed, source_id, idempotency_key, created_at")
    .in("partner_id", uniquePartnerIds)
    .gte("created_at", sinceIso);
  if (error) throw error;
  const registrySet = new Set((registryCommissionIds || []).map(String));
  const orphans = [];
  for (const row of rows || []) {
    const exposure = await computeCommissionEconomicExposure(service, row.id);
    const inRegistry = registrySet.has(String(row.id));
    if (exposure.hasExposure || !inRegistry) {
      orphans.push({
        commissionId: row.id,
        partnerId: row.partner_id,
        sourceId: row.source_id,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        activeAmount: exposure.activeAmount,
        ledgerNet: exposure.ledgerNet,
        ledgerCreditId: exposure.ledgerCreditId,
        inRegistry,
        unregistered: !inRegistry,
      });
    }
  }
  return orphans;
}

async function assertCommissionSafeToPurge(service, commissionId, { partnerBaselines = null } = {}) {
  const { data: commission, error } = await service
    .from("partner_commissions")
    .select("id, partner_id, amount, amount_reversed, status, source_type")
    .eq("id", commissionId)
    .maybeSingle();
  if (error) throw error;
  if (!commission?.id) return { ok: true, reason: "already_gone" };

  const ledgerNet = await computeCommissionLedgerNet(service, commissionId);
  if (Math.abs(ledgerNet) > 0.001) {
    throw new Error(`purge_blocked_ledger_net_nonzero:${commissionId}:${ledgerNet}`);
  }

  const activeAmount = roundMoney(
    Math.max(0, Number(commission.amount || 0) - Number(commission.amount_reversed || 0))
  );
  const economicallyActive =
    !["reversed", "rejected"].includes(String(commission.status || "")) && activeAmount > 0;
  if (economicallyActive) {
    throw new Error(`purge_blocked_active_commission_exposure:${commissionId}:${activeAmount}`);
  }

  if (commission.status === "reversed" || commission.status === "rejected") {
    const economicState = await inspectServiceCommissionEconomicState(service, {
      commissionId,
      partnerId: commission.partner_id,
      partnerBaseline: partnerBaselines?.[commission.partner_id] || null,
    });
    if (economicState.balanceRestorationProven) {
      return { ok: true, via: "balance_restoration_proven", economicState };
    }
    throw new Error(
      `purge_blocked_unknown_balance_restoration_state:${commissionId}:${JSON.stringify({
        pendingExposureExpected: economicState.pendingExposureExpected,
        earningsExposureExpected: economicState.earningsExposureExpected,
        ledgerNet: economicState.ledgerNet,
        balanceRestoreMarkerExists: economicState.balanceRestoreMarkerExists,
        canonicalReversalExists: economicState.canonicalReversalExists,
      })}`
    );
  }

  return { ok: true };
}

async function assertCommissionsSafeToPurge(service, commissionIds, { partnerBaselines = null } = {}) {
  const blocked = [];
  for (const commissionId of commissionIds || []) {
    try {
      await assertCommissionSafeToPurge(service, commissionId, { partnerBaselines });
    } catch (err) {
      blocked.push({ commissionId, message: String(err?.message || err) });
    }
  }
  if (blocked.length) {
    throw new Error(`purge_invariant_failed:${JSON.stringify(blocked.slice(0, 5))}`);
  }
  return { checked: (commissionIds || []).length };
}

const BASELINE_STABILITY_KEYS = [
  "ledger_signed_sum",
  "commission_sum",
  "partner_balance_pending",
  "partner_balance_bonus_pending",
  "partner_balance_withdrawable",
  "partner_total_earnings",
];

export function compareBaselineEconomicState(a, b, keys = BASELINE_STABILITY_KEYS) {
  const deltas = {};
  for (const k of keys) {
    deltas[k] = Number(b[k] || 0) - Number(a[k] || 0);
  }
  const stable = keys.every((k) => Math.abs(deltas[k]) < 0.001);
  return { stable, deltas, keys };
}

export async function assertPostCleanupCommissionScope(
  service,
  commissionId,
  { finBeforeIso, runToken, runId, registryCommissionIds, hookCommissionIds } = {}
) {
  const { data: row, error } = await service
    .from("partner_commissions")
    .select("id, created_at, idempotency_key")
    .eq("id", commissionId)
    .maybeSingle();
  if (error) throw error;
  if (!row?.id) return { ok: true, skipped: true };

  const registrySet = new Set((registryCommissionIds || []).map(String));
  const hookSet = new Set((hookCommissionIds || []).map(String));
  const inRegistry = registrySet.has(String(row.id));
  const hookOwned = hookSet.has(String(row.id));
  const afterFinBefore = finBeforeIso ? new Date(row.created_at) >= new Date(finBeforeIso) : true;
  const idempotencyKey = String(row.idempotency_key || "");
  const runTokenMatch = runToken && idempotencyKey.includes(runToken);
  const runIdMatch = runId && idempotencyKey.includes(String(runId).replace(/^r8_/, ""));
  const currentRunPrefixMatch = idempotencyKey.startsWith("r8:");

  if (
    !afterFinBefore ||
    (!inRegistry && !hookOwned && !runTokenMatch && !runIdMatch && !currentRunPrefixMatch)
  ) {
    throw new Error(
      `R8_POST_CLEANUP_HISTORICAL_ROW_BLOCKED:${JSON.stringify({
        commission_id: row.id,
        created_at: row.created_at,
        idempotency_key: row.idempotency_key,
        inRegistry,
        hookOwned,
        afterFinBefore,
        runTokenMatch,
      })}`
    );
  }
  return { ok: true, inRegistry, hookOwned, afterFinBefore, runTokenMatch };
}

export async function verifyPreBaselineR8Quiescence(service) {
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const discovered = await discoverActiveR8FixturePartnerIds(service, { sinceIso });
  const issues = [];
  if (discovered.partnerIds.length) {
    const { count: pendingCommissions, error: commErr } = await service
      .from("partner_commissions")
      .select("id", { count: "exact", head: true })
      .in("partner_id", discovered.partnerIds)
      .in("status", ["pending", "pending_activation", "approved", "released"]);
    if (commErr) throw commErr;
    if (pendingCommissions > 0) issues.push(`pending_r8_commissions=${pendingCommissions}`);

    const { count: pendingRewards, error: rewardErr } = await service
      .from("partner_reward_entitlements")
      .select("id", { count: "exact", head: true })
      .in("partner_id", discovered.partnerIds)
      .eq("status", "pending");
    if (rewardErr) throw rewardErr;
    if (pendingRewards > 0) issues.push(`pending_r8_rewards=${pendingRewards}`);
  }
  return { ok: issues.length === 0, discovered, issues };
}

async function purgeCommissionIdsExplicit(service, commissionIds, reason = "r8_registry_purge_precondition", { partnerBaselines = null } = {}) {
  const ids = [...new Set((commissionIds || []).filter(Boolean))];
  if (!ids.length) return { deleted: 0 };
  await ensureCommissionsEconomicallyNeutralBeforePurge(service, ids, reason, { partnerBaselines });
  await assertCommissionsSafeToPurge(service, ids, { partnerBaselines });
  await deleteCommissionLedgerBundleForPurge(service, ids);
  const idsLiteral = ids.map((id) => `'${String(id).replace(/'/g, "")}'::uuid`).join(", ");
  runStagingSql(
    `
    ALTER TABLE public.partner_financial_ledger_entries DISABLE TRIGGER partner_financial_ledger_no_update;
    ALTER TABLE public.partner_financial_ledger_entries DISABLE TRIGGER partner_financial_ledger_no_delete;
    DELETE FROM public.partner_financial_ledger_entries WHERE legacy_commission_id = ANY(ARRAY[${idsLiteral}]::uuid[]);
    DELETE FROM public.partner_service_commission_reversals WHERE commission_id = ANY(ARRAY[${idsLiteral}]::uuid[]);
    DELETE FROM public.partner_commissions WHERE id = ANY(ARRAY[${idsLiteral}]::uuid[]);
    ALTER TABLE public.partner_financial_ledger_entries ENABLE TRIGGER partner_financial_ledger_no_update;
    ALTER TABLE public.partner_financial_ledger_entries ENABLE TRIGGER partner_financial_ledger_no_delete;
    `,
    { optional: true }
  );
  return { deleted: ids.length };
}

export async function cleanupCurrentRunFromRegistry(
  service,
  { runId, fx, registry, finBeforeIso, runStartedAt, partnerBaselines = null } = {}
) {
  const runToken = String(runId || "").replace(/^r8_/, "").split("-")[0];
  const registryCommissionIds = getRegistryOwnedCommissionIds(registry);
  const hookCommissionIds = (registry?.hookCommissionRecords || []).map((row) => row.commissionId);
  const partnerIds = [
    ...(fx?.cleanupIds?.partnerIds || []),
    ...(registry?.tierPartnerIds || []),
  ];
  const uniquePartnerIds = [...new Set(partnerIds.filter(Boolean))];
  const report = {
    runId,
    runToken,
    finBeforeIso,
    runStartedAt,
    registryCommissionCount: registryCommissionIds.length,
    partnerScope: uniquePartnerIds.length,
    historicalRowsTouchedAfterFinBefore: 0,
    commissionReversal: null,
    purge: null,
  };

  let commissionIds = [...registryCommissionIds];
  if (runToken && uniquePartnerIds.length && finBeforeIso) {
    const tokenIds = await listCommissionIdsForPurge(service, uniquePartnerIds, {
      sinceIso: finBeforeIso,
      idempotencyLike: `%${runToken}%`,
    });
    commissionIds = [...new Set([...commissionIds, ...tokenIds])];
  }
  report.scopedCommissionCount = commissionIds.length;

  for (const commissionId of commissionIds) {
    await assertPostCleanupCommissionScope(service, commissionId, {
      finBeforeIso,
      runToken,
      runId,
      registryCommissionIds,
      hookCommissionIds,
    });
  }

  if (!commissionIds.length) {
    report.skipped = true;
    return report;
  }

  report.commissionReversal = await reverseCommissionsByIds(service, commissionIds, {
    reason: "r8_forensic_registry_cleanup",
    partnerBaselines,
  });
  await ensureCommissionsEconomicallyNeutralBeforePurge(
    service,
    commissionIds,
    "r8_forensic_registry_pre_purge",
    { partnerBaselines }
  );
  const orphanExposure = await listCurrentRunOrphanCommissions(service, {
    partnerIds: uniquePartnerIds,
    sinceIso: finBeforeIso,
    registryCommissionIds: registryCommissionIds,
  });
  if (orphanExposure.length) {
    throw new Error(`registry_orphan_exposure_before_purge:${JSON.stringify(orphanExposure.slice(0, 3))}`);
  }
  report.purge = await purgeCommissionIdsExplicit(service, commissionIds, "r8_forensic_registry_purge_precondition", {
    partnerBaselines,
  });

  const like = `%${runId}%`;
  const likeToken = runToken ? `%${runToken}%` : like;
  try {
    await service.from("partner_service_commission_reversals").delete().filter("idempotency_key", "like", like);
  } catch { /* optional */ }
  try {
    await service.from("partner_service_commission_entitlements").delete().filter("idempotency_key", "like", like);
  } catch { /* optional */ }
  await service.from("subscription_requests").delete().filter("payment_proof_path", "like", `r8/${runId}%`);
  if (runToken) {
    await service.from("subscription_requests").delete().filter("payment_proof_path", "like", `%${runToken}%`);
  }
  return report;
}

async function purgeRunCommissionsFiltered(service, partnerIds, { sinceIso = null, idempotencyLike = null } = {}) {
  const uniquePartnerIds = [...new Set(partnerIds.filter(Boolean))];
  if (!uniquePartnerIds.length) return { deleted: 0 };
  const commissionIds = await listCommissionIdsForPurge(service, uniquePartnerIds, { sinceIso, idempotencyLike });
  if (!commissionIds.length) return { deleted: 0 };
  await ensureCommissionsEconomicallyNeutralBeforePurge(service, commissionIds, "r8_purge_precondition");
  await assertCommissionsSafeToPurge(service, commissionIds);
  await deleteCommissionLedgerBundleForPurge(service, commissionIds);
  const idsLiteral = commissionIds.map((id) => `'${String(id).replace(/'/g, "")}'::uuid`).join(", ");
  runStagingSql(
    `
    ALTER TABLE public.partner_financial_ledger_entries DISABLE TRIGGER partner_financial_ledger_no_update;
    ALTER TABLE public.partner_financial_ledger_entries DISABLE TRIGGER partner_financial_ledger_no_delete;
    DELETE FROM public.partner_financial_ledger_entries WHERE legacy_commission_id = ANY(ARRAY[${idsLiteral}]::uuid[]);
    DELETE FROM public.partner_service_commission_reversals WHERE commission_id = ANY(ARRAY[${idsLiteral}]::uuid[]);
    DELETE FROM public.partner_commissions WHERE id = ANY(ARRAY[${idsLiteral}]::uuid[]);
    ALTER TABLE public.partner_financial_ledger_entries ENABLE TRIGGER partner_financial_ledger_no_update;
    ALTER TABLE public.partner_financial_ledger_entries ENABLE TRIGGER partner_financial_ledger_no_delete;
    `,
    { optional: true }
  );
  return { deleted: commissionIds.length, filtered: Boolean(idempotencyLike) };
}

async function purgeRunCommissionsRpc(service, partnerIds, runStartedAt) {
  const uniquePartnerIds = [...new Set(partnerIds.filter(Boolean))];
  if (!uniquePartnerIds.length) return { deleted: 0 };
  const commissionIds = await listCommissionIdsForPurge(service, uniquePartnerIds, { sinceIso: runStartedAt || null });
  await ensureCommissionsEconomicallyNeutralBeforePurge(service, commissionIds, "r8_purge_precondition");
  await assertCommissionsSafeToPurge(service, commissionIds);
  await deleteCommissionLedgerBundleForPurge(service, commissionIds);
  const { data, error } = await service.rpc("partner_center_staging_purge_run_commissions", {
    p_partner_ids: uniquePartnerIds,
    p_since: runStartedAt || null,
  });
  if (error) {
    purgeRunCommissionsSql(uniquePartnerIds, runStartedAt);
    return { deleted: null, fallback: true };
  }
  return data || { deleted: 0 };
}

export async function cleanupRunFixtures(
  service,
  runId,
  fx,
  registry = null,
  runStartedAt = null,
  options = {}
) {
  const { forensicMode = false, finBeforeIso = null } = options;
  if (forensicMode && finBeforeIso) {
    return cleanupCurrentRunFromRegistry(service, { runId, fx, registry, finBeforeIso, runStartedAt });
  }

  const like = `%${runId}%`;
  const runToken = String(runId).replace(/^r8_/, "").split("-")[0];
  const likeToken = runToken ? `%${runToken}%` : like;
  const scopedPartnerIds = [
    ...(fx?.cleanupIds?.partnerIds || []),
    ...(registry?.tierPartnerIds || []),
  ];
  await clearStagingFailureFlags(service);
  if (runStartedAt) {
    const discovered = forensicMode
      ? { partnerIds: [] }
      : await discoverActiveR8FixturePartnerIds(service, { sinceIso: runStartedAt });
    const allPartnerIds = [...new Set([...scopedPartnerIds, ...discovered.partnerIds])];
    if (allPartnerIds.length) {
      await reverseR8FixtureCommissionsEconomically(service, {
        partnerIds: allPartnerIds,
        sinceIso: runStartedAt,
        reason: "r8_run_cleanup_before_purge",
      });
      if (registry?.commissionIds?.length) {
        await reverseCommissionsByIds(service, registry.commissionIds, {
          reason: "r8_registry_commission_cleanup",
        });
      }
      if (runToken) {
        await reverseR8FixtureCommissionsEconomically(service, {
          partnerIds: allPartnerIds,
          sinceIso: null,
          idempotencyLike: `%${runToken}%`,
          reason: "r8_run_idempotency_cleanup",
        });
      }
      await purgeRunCommissionsRpc(service, allPartnerIds, runStartedAt);
      if (runToken) {
        await purgeRunCommissionsFiltered(service, allPartnerIds, {
          sinceIso: null,
          idempotencyLike: `%${runToken}%`,
        });
      }
    }
  }
  try {
    await service.from("partner_service_commission_reversals").delete().filter("idempotency_key", "like", like);
  } catch { /* optional table rows */ }
  try {
    const { data: runSubs } = await service
      .from("subscription_requests")
      .select("id")
      .or(`payment_proof_path.like.r8/${runId}%,payment_proof_path.like.%${runToken}%`);
    const subSourceIds = (runSubs || []).map((row) => String(row.id)).filter(Boolean);
    if (subSourceIds.length && runStartedAt) {
      const { data: subComms } = await service
        .from("partner_commissions")
        .select("id, partner_id, status, source_type")
        .in("source_id", subSourceIds);
      const subPartnerIds = [...new Set((subComms || []).map((c) => c.partner_id).filter(Boolean))];
      if (subPartnerIds.length) {
        await reverseR8FixtureCommissionsEconomically(service, {
          partnerIds: subPartnerIds,
          sinceIso: runStartedAt,
          reason: "r8_run_cleanup_subscription_sources",
        });
        await purgeRunCommissionsFiltered(service, subPartnerIds, {
          sinceIso: runStartedAt,
        });
      }
    }
  } catch { /* optional */ }
  await service.from("partner_service_commission_entitlements").delete().filter("idempotency_key", "like", like);
  await service.from("subscription_requests").delete().filter("payment_proof_path", "like", `r8/${runId}%`);
  await service.from("subscription_requests").delete().filter("payment_proof_path", "like", `%${runToken}%`);
  for (const pid of fx?.cleanupIds?.partnerIds || []) {
    try {
      await service.from("partner_fraud_assessments").delete().eq("partner_id", pid);
    } catch { /* ignore */ }
  }
  for (const rid of fx?.cleanupIds?.fraudReferralIds || []) {
    try {
      await service.from("partner_fraud_assessments").delete().eq("referral_id", rid);
    } catch { /* ignore */ }
  }
}

export async function adminApi(base, cookie, method, body, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(`${base}/api/admin/partner-marketing/service-commissions`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 200) };
      }
      return { status: res.status, json, ok: res.ok };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleepMs(400 * attempt);
    }
  }
  throw lastErr || new Error("adminApi_fetch_failed");
}

export async function runRegressionSuite(scriptPath) {
  const result = spawnSync("node", ["--test", scriptPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const passMatch = result.stdout?.match(/ℹ pass (\d+)/);
  const failMatch = result.stdout?.match(/ℹ fail (\d+)/);
  return {
    script: scriptPath,
    exitCode: result.status,
    passed: Number(passMatch?.[1] || 0),
    failed: Number(failMatch?.[1] || 0),
    stdout: result.stdout?.slice(-500),
    stderr: result.stderr?.slice(-500),
  };
}

export async function runBuild() {
  const result = spawnSync("npm", ["run", "build"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: "production" },
  });
  return { exitCode: result.status, ok: result.status === 0 };
}

export {
  crypto,
  QUALIFICATION_STATES,
  FRAUD_RISK_LEVELS,
  reversePartnerServiceCommissionAtomic,
  releasePartnerCommissionAtomic,
};
