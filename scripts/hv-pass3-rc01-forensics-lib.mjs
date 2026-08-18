/**
 * RC-01 forensic helpers — staging harness only.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DOMAIN, ROOT } from "./hv-abuse-pass2-lib.mjs";

export const PROVENANCE = Object.freeze({
  HV_PASS3: "A_hv_pass3_current_run_fixture",
  R6: "B_r6_pre_gate_fixture",
  R7: "C_r7_pre_gate_fixture",
  R8: "D_r8_pre_gate_fixture",
  R9: "E_r9_pre_gate_fixture",
  MC_SC_PROBE: "F_mc_sc_probe_fixture",
  BACKGROUND: "G_background_or_natural_staging",
  UNTRACKED: "H_untracked_harness_leak",
});

export function maskId(id) {
  const s = String(id || "");
  if (s.length < 12) return s ? `${s.slice(0, 4)}…` : null;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

export function signedLedgerAmount(row) {
  const amt = Number(row?.amount || 0);
  return row?.entry_direction === "debit" ? -amt : amt;
}

export function isStagingRegressionFixtureEmail(email = "") {
  const e = String(email || "").toLowerCase();
  if (!e.endsWith(`@${FIXTURE_DOMAIN}`)) return false;
  return (
    e.startsWith("r6-") ||
    e.startsWith("r7-") ||
    e.startsWith("r7-ref-") ||
    e.includes("r8_") ||
    e.startsWith("r8-") ||
    e.includes("r9_") ||
    e.startsWith("r9-") ||
    e.includes("hv-pass3-") ||
    e.includes("hv-blocker-") ||
    e.includes("mc-probe") ||
    e.includes("sc-probe") ||
    e.includes("hv-pass3-probe-")
  );
}

export function classifyProvenanceFromSignals({ email, idempotencyKey = "", metadata = {}, userMetadata = {}, runTag = "" } = {}) {
  const blob = `${email}|${idempotencyKey}|${JSON.stringify(metadata)}|${JSON.stringify(userMetadata)}|${runTag}`.toLowerCase();
  if (/hv-pass3-|hv-blocker-|p3mis|p3c/i.test(blob)) return PROVENANCE.HV_PASS3;
  if (/mc-probe|sc-probe/i.test(blob)) return PROVENANCE.MC_SC_PROBE;
  if (/r6-staging|r6-partner|r6-ref|r6_/i.test(blob)) return PROVENANCE.R6;
  if (/r7-staging|r7-ref|^r7-/i.test(blob)) return PROVENANCE.R7;
  if (/r8_|r8-/i.test(blob)) return PROVENANCE.R8;
  if (/r9_|r9-|r9-staging/i.test(blob)) return PROVENANCE.R9;
  if (isStagingRegressionFixtureEmail(email)) return PROVENANCE.UNTRACKED;
  return PROVENANCE.BACKGROUND;
}

const TRANSIENT_AUTH_PATTERNS = [
  /AuthRetryableFetchError/i,
  /fetch failed/i,
  /ECONNRESET/i,
  /EPIPE/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /socket hang up/i,
];

const AUTH_LIST_BACKOFF_MS = [0, 500, 1500];
const AUTH_LIST_TIMEOUT_MS = 15000;
const AUTH_LIST_MAX_ATTEMPTS = 3;

export function createAuthRetryStats() {
  return { attempts: 0, retries: 0, transientFailures: [], fallbackUsed: false };
}

export async function withTransientRetry(fn, { maxAttempts = 3, stats = null, label = "operation" } = {}) {
  const retryStats = stats || createAuthRetryStats();
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    retryStats.attempts += 1;
    if (attempt > 0) {
      retryStats.retries += 1;
      await new Promise((resolve) => setTimeout(resolve, AUTH_LIST_BACKOFF_MS[attempt] || 1500));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      retryStats.transientFailures.push({
        label,
        attempt: attempt + 1,
        name: err?.name || "Error",
        message: String(err?.message || err).slice(0, 200),
      });
      if (!isTransientAuthError(err) || attempt === maxAttempts - 1) throw err;
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

function isNonRetryAuthError(err) {
  const blob = `${err?.name || ""}|${err?.message || ""}|${err?.status || ""}|${err?.code || ""}|${err?.cause?.code || ""}|${err?.cause?.message || ""}`;
  return /(?:^|\|)(401|403)(?:\||$)|invalid.*credential|permission denied|malformed|not authorized/i.test(blob);
}

export function isTransientAuthError(err) {
  if (isNonRetryAuthError(err)) return false;
  const blob = `${err?.name || ""}|${err?.message || ""}|${err?.cause?.code || ""}|${err?.cause?.message || ""}`;
  return TRANSIENT_AUTH_PATTERNS.some((pattern) => pattern.test(blob));
}

async function listAuthUsersPageWithRetry(service, page, stats) {
  let lastErr = null;
  for (let attempt = 0; attempt < AUTH_LIST_MAX_ATTEMPTS; attempt += 1) {
    stats.attempts += 1;
    if (attempt > 0) {
      stats.retries += 1;
      await new Promise((resolve) => setTimeout(resolve, AUTH_LIST_BACKOFF_MS[attempt] || 1500));
    }
    try {
      const result = await Promise.race([
        service.auth.admin.listUsers({ page, perPage: 200 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error("ETIMEDOUT"), { name: "TimeoutError" })), AUTH_LIST_TIMEOUT_MS)
        ),
      ]);
      if (result?.error) throw result.error;
      return result?.data || { users: [] };
    } catch (err) {
      lastErr = err;
      stats.transientFailures.push({
        page,
        attempt: attempt + 1,
        name: err?.name || "Error",
        message: String(err?.message || err).slice(0, 200),
      });
      if (!isTransientAuthError(err) || attempt === AUTH_LIST_MAX_ATTEMPTS - 1) throw err;
    }
  }
  throw lastErr || new Error("listAuthUsersPaginated failed");
}

/** Auth directory scan — retry transient network errors only; prefer profile-based discovery for cleanup. */
export async function listAuthUsersPaginated(service, { maxPages = 30, stats = null } = {}) {
  const retryStats = stats || createAuthRetryStats();
  const users = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await listAuthUsersPageWithRetry(service, page, retryStats);
    for (const u of data?.users || []) users.push(u);
    if ((data?.users?.length || 0) < 200) break;
  }
  return users;
}

export async function buildUserProvenanceIndex(service) {
  const users = await listAuthUsersPaginated(service);
  const byUserId = new Map();
  const byPartnerUserId = new Map();
  for (const u of users) {
    const email = u.email || "";
    const provenance = classifyProvenanceFromSignals({
      email,
      userMetadata: u.user_metadata || {},
      runTag: u.user_metadata?.r6 || u.user_metadata?.r7 || u.user_metadata?.run || "",
    });
    byUserId.set(u.id, { email, provenance, userMetadata: u.user_metadata || {} });
  }
  const userIds = [...byUserId.keys()];
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);
    const { data: partners } = await service.from("partners").select("id, user_id").in("user_id", chunk);
    for (const p of partners || []) {
      const user = byUserId.get(p.user_id);
      if (user) byPartnerUserId.set(p.id, { ...user, partnerId: p.id });
    }
  }
  return { byUserId, byPartnerUserId, users };
}

export async function fetchLedgerRowsSince(service, sinceIso, { limit = 500 } = {}) {
  let q = service
    .from("partner_financial_ledger_entries")
    .select(
      "id, partner_id, entry_type, entry_direction, amount, balance_bucket, reference_type, reference_id, legacy_commission_id, idempotency_key, metadata, created_at"
    )
    .order("created_at", { ascending: true })
    .limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchCommissionsSince(service, sinceIso, { limit = 500 } = {}) {
  let q = service
    .from("partner_commissions")
    .select(
      "id, partner_id, referral_id, source_type, source_id, service_type, amount, status, idempotency_key, payout_hold, reason, created_at, qualification_credited_at"
    )
    .order("created_at", { ascending: true })
    .limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchReferralsSince(service, sinceIso, { limit = 500 } = {}) {
  let q = service
    .from("partner_referrals")
    .select("id, partner_id, referred_user_id, referral_code, referred_username, status, created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchPartnerBalances(service, partnerIds = null) {
  let q = service
    .from("partners")
    .select("id, user_id, balance_pending, balance_bonus_pending, balance_withdrawable, total_earnings, total_withdrawn, referral_code");
  if (partnerIds?.length) q = q.in("id", partnerIds);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export function summarizeSignedLedger(rows) {
  return (rows || []).reduce((sum, row) => sum + signedLedgerAmount(row), 0);
}

export function enrichLedgerRow(row, index, { byPartnerUserId, byUserId }) {
  const partnerCtx = byPartnerUserId.get(row.partner_id) || null;
  const provenance = partnerCtx
    ? partnerCtx.provenance
    : classifyProvenanceFromSignals({ idempotencyKey: row.idempotency_key, metadata: row.metadata || {} });
  return {
    index,
    ledger_id: row.id,
    partner_id_masked: maskId(row.partner_id),
    partner_email: partnerCtx?.email || null,
    legacy_commission_id: row.legacy_commission_id || null,
    reference_type: row.reference_type || null,
    reference_id: row.reference_id || null,
    entry_type: row.entry_type,
    entry_direction: row.entry_direction,
    amount: Number(row.amount || 0),
    signed_amount: signedLedgerAmount(row),
    balance_bucket: row.balance_bucket,
    idempotency_key: row.idempotency_key || null,
    created_at: row.created_at,
    provenance,
    metadata: row.metadata || {},
  };
}

export function enrichCommissionRow(row, index, { byPartnerUserId, byUserId }) {
  const partnerCtx = byPartnerUserId.get(row.partner_id) || null;
  const provenance = classifyProvenanceFromSignals({
    email: partnerCtx?.email || "",
    idempotencyKey: row.idempotency_key || "",
    metadata: {},
    runTag: row.reason || "",
  });
  return {
    index,
    commission_id: row.id,
    partner_id_masked: maskId(row.partner_id),
    partner_email: partnerCtx?.email || null,
    referral_id_masked: maskId(row.referral_id),
    source_type: row.source_type,
    source_id: row.source_id,
    service_type: row.service_type,
    amount: Number(row.amount || 0),
    status: row.status,
    idempotency_key: row.idempotency_key || null,
    payout_hold: row.payout_hold,
    reason: row.reason || null,
    created_at: row.created_at,
    provenance,
  };
}

export function enrichReferralRow(row, index, { byPartnerUserId, byUserId }) {
  const partnerCtx = byPartnerUserId.get(row.partner_id) || null;
  const referredCtx = row.referred_user_id ? byUserId.get(row.referred_user_id) : null;
  const provenance = classifyProvenanceFromSignals({
    email: partnerCtx?.email || referredCtx?.email || "",
    runTag: row.referred_username || "",
  });
  return {
    index,
    referral_id: row.id,
    partner_id_masked: maskId(row.partner_id),
    partner_email: partnerCtx?.email || null,
    referred_user_id_masked: maskId(row.referred_user_id),
    referred_email: referredCtx?.email || null,
    referral_code: row.referral_code,
    referred_username: row.referred_username,
    status: row.status,
    created_at: row.created_at,
    provenance,
  };
}

export function diffPartnerBalances(preRows, postRows) {
  const preMap = new Map((preRows || []).map((r) => [r.id, r]));
  const changes = [];
  for (const post of postRows || []) {
    const pre = preMap.get(post.id);
    if (!pre) {
      changes.push({ partner_id_masked: maskId(post.id), note: "new_partner", post });
      continue;
    }
    const fields = ["balance_pending", "balance_bonus_pending", "balance_withdrawable", "total_earnings", "total_withdrawn"];
    const delta = {};
    let changed = false;
    for (const f of fields) {
      const d = Number(post[f] || 0) - Number(pre[f] || 0);
      if (Math.abs(d) > 0.0001) {
        delta[f] = d;
        changed = true;
      }
    }
    if (changed) {
      changes.push({
        partner_id_masked: maskId(post.id),
        user_id_masked: maskId(post.user_id),
        referral_code: post.referral_code,
        pre: {
          balance_pending: Number(pre.balance_pending || 0),
          balance_bonus_pending: Number(pre.balance_bonus_pending || 0),
          balance_withdrawable: Number(pre.balance_withdrawable || 0),
          total_earnings: Number(pre.total_earnings || 0),
          total_withdrawn: Number(pre.total_withdrawn || 0),
        },
        post: {
          balance_pending: Number(post.balance_pending || 0),
          balance_bonus_pending: Number(post.balance_bonus_pending || 0),
          balance_withdrawable: Number(post.balance_withdrawable || 0),
          total_earnings: Number(post.total_earnings || 0),
          total_withdrawn: Number(post.total_withdrawn || 0),
        },
        delta,
      });
    }
  }
  return changes;
}

export function loadPass3ArtifactBaseline(path) {
  if (!path || !existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return {
    runId: parsed.runId,
    generatedAt: parsed.generatedAt,
    pre: parsed.financialReconciliation?.pre || null,
    post: parsed.financialReconciliation?.post || null,
    delta: parsed.financialReconciliation?.delta || null,
    reconciliationExact: parsed.financialReconciliation?.reconciliationExact,
  };
}

export function findLatestRegressionArtifacts() {
  const dir = join(ROOT, "scripts/partner-center/.artifacts");
  if (!existsSync(dir)) return {};
  const files = readdirSync(dir);
  const pickLatest = (prefix) =>
    files
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .sort()
      .at(-1) || null;
  return {
    r6: pickLatest("r6-staging-"),
    r7: pickLatest("r7-staging-"),
    r8: pickLatest("r8-manifest-r8_"),
    r9: pickLatest("r9-manifest-r9_"),
  };
}
