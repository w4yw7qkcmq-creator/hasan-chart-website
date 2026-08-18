/**
 * Pre-gate staging fixture cleanup — R6/R7/R8/R9/MC/SC probes only.
 * STAGING harness; uses canonical reversal + purge RPC; no production writes.
 */
import {
  purgeRunCommissionsRpc,
  purgeAllPass3StagingFixtures,
  countActivePass3FixtureResidue,
  activeFixtureResidueZero,
  financialBaselineStrict,
} from "./hv-pass3-cleanup-lib.mjs";
import {
  createRunRegistry,
  cleanupRunRegistry,
  purgePriorBlockerFixtures,
  compareFinancialSnapshots,
  trackRegistry,
} from "./hv-pass3-fixture-lib.mjs";
import {
  createAuthRetryStats,
  isStagingRegressionFixtureEmail,
  listAuthUsersPaginated,
  withTransientRetry,
} from "./hv-pass3-rc01-forensics-lib.mjs";
import {
  reversePartnerLedgerEntryAtomic,
  reversePartnerServiceCommissionAtomic,
  reversePartnerSignupBonusCommissionEconomically,
  reversePartnerQualifiedReferralRewardEconomically,
  reversePartnerServiceCommissionLedgerAlreadyReversed,
  findLedgerCreditForCommission,
  restorePartnerBalancesAfterLedgerCreditReversal,
  restorePartnerServiceCommissionBalanceAfterLedgerNetZero,
  sumPartnerLedgerSigned,
} from "../lib/partner-center/financial-gateway.js";
import { roundMoney } from "../lib/partner-center/money.js";

export const PERSISTENT_VALIDATION_ADMIN_EMAILS = new Set([
  "isolated-validation-admin@isolated-hcw.test",
]);

export function isPersistentValidationAdminEmail(email = "") {
  return PERSISTENT_VALIDATION_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

export function isPreGateFixtureEmail(email = "") {
  return isStagingRegressionFixtureEmail(email);
}

function isHarnessFixtureAuthEmail(email = "") {
  const e = String(email || "").toLowerCase();
  if (!e) return false;
  if (isPersistentValidationAdminEmail(e)) return false;
  if (e.endsWith("@isolated-hcw.test")) return true;
  if (e.endsWith("@staging-hcw.test") && /^(r[6789]|hv-pass3|hv-blocker|isolated-r7|staging-validation)/i.test(e)) return true;
  if (e.includes("hv-pass3-")) return true;
  return isPreGateFixtureEmail(e);
}

async function deleteHarnessFixtureAuthUsers(service) {
  let removed = 0;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data?.users || []) {
      const meta = u.raw_user_meta_data || u.user_metadata || {};
      if (isPersistentValidationAdminEmail(u.email) || meta.persistent_reference_identity || meta.validation_admin) {
        continue;
      }
      if (isHarnessFixtureAuthEmail(u.email) || meta.run_id || meta.r8_fixture === true) {
        await service.auth.admin.deleteUser(u.id).catch(() => null);
        removed += 1;
      }
    }
    if ((data?.users?.length || 0) < 200) break;
  }
  return removed;
}

export function mergePreGateRunRegistries(...registries) {
  const merged = createRunRegistry();
  merged.runTag = "pregate-cleanup";
  for (const reg of registries) {
    if (!reg) continue;
    if (reg.runTag) merged.runTag = reg.runTag;
    for (const key of Object.keys(merged)) {
      if (!Array.isArray(reg[key]) || !Array.isArray(merged[key])) continue;
      for (const id of reg[key]) trackRegistry(merged, key, id);
    }
  }
  return merged;
}

/** Primary discovery: profiles table (no auth directory scan). */
export async function discoverPreGateFixtureProfiles(service, { sinceIso = null, strictSince = false } = {}) {
  const sinceMs = sinceIso
    ? Date.parse(sinceIso) - (strictSince ? 0 : 60_000)
    : Date.now() - 48 * 60 * 60 * 1000;
  const { data, error } = await service
    .from("profiles")
    .select("id, email, created_at")
    .gte("created_at", new Date(sinceMs).toISOString())
    .limit(5000);
  if (error) throw error;
  return (data || []).filter((p) => isPreGateFixtureEmail(p.email));
}

export async function discoverPreGateFixtureUsers(service, opts = {}) {
  const profiles = await discoverPreGateFixtureProfiles(service, opts);
  return profiles.map((p) => ({ id: p.id, email: p.email, created_at: p.created_at }));
}

/** Auth listUsers fallback — only when profile discovery misses known auth-only fixture accounts. */
export async function discoverPreGateFixtureUsersAuthFallback(service, { stats = null, sinceIso = null } = {}) {
  const retryStats = stats || createAuthRetryStats();
  retryStats.fallbackUsed = true;
  const sinceMs = sinceIso ? Date.parse(sinceIso) - 60_000 : Date.now() - 48 * 60 * 60 * 1000;
  const users = await listAuthUsersPaginated(service, { maxPages: 30, stats: retryStats });
  return users.filter((u) => {
    if (!isPreGateFixtureEmail(u.email)) return false;
    const createdMs = Date.parse(u.created_at || u.createdAt || "");
    if (Number.isFinite(createdMs) && createdMs < sinceMs) return false;
    return true;
  });
}

export async function buildPreGateRegistryFromUsers(service, users) {
  const registry = createRunRegistry();
  registry.runTag = "pregate-cleanup";
  for (const u of users) {
    registry.authUserIds.push(u.id);
    trackRegistry(registry, "profileIds", u.id);
    const metaRun = u.user_metadata?.r6 || u.user_metadata?.r7 || u.user_metadata?.run || "";
    if (metaRun) registry.runTag = String(metaRun);
  }
  const userIds = registry.authUserIds;
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);
    const { data: partners } = await service.from("partners").select("id, user_id").in("user_id", chunk);
    for (const p of partners || []) trackRegistry(registry, "partnerIds", p.id);
    const partnerIds = (partners || []).map((p) => p.id);
    let refQuery = service.from("partner_referrals").select("id, referred_user_id").in("referred_user_id", chunk);
    if (partnerIds.length) {
      refQuery = service
        .from("partner_referrals")
        .select("id, referred_user_id")
        .or(`referred_user_id.in.(${chunk.join(",")}),partner_id.in.(${partnerIds.join(",")})`);
    }
    const { data: refs } = await refQuery;
    for (const r of refs || []) {
      trackRegistry(registry, "referralIds", r.id);
      if (r.referred_user_id && !registry.authUserIds.includes(r.referred_user_id)) {
        trackRegistry(registry, "authUserIds", r.referred_user_id);
        trackRegistry(registry, "profileIds", r.referred_user_id);
      }
    }
  }
  return registry;
}

export async function buildPreGateRegistryFromDiscovery(service, { sinceIso = null, preGateRunRegistry = null, strictSince = false } = {}) {
  const profileUsers = await discoverPreGateFixtureUsers(service, { sinceIso, strictSince });
  let registry = await buildPreGateRegistryFromUsers(service, profileUsers);
  if (preGateRunRegistry) registry = mergePreGateRunRegistries(registry, preGateRunRegistry);
  return registry;
}

function preGateDeltaKeysOk(delta = {}) {
  const numericKeys = [
    "ledger_signed_sum",
    "commission_sum",
    "non_fixture_ledger_sum",
    "non_fixture_commission_sum",
    "partner_balance_pending",
    "partner_balance_bonus_pending",
    "partner_balance_withdrawable",
    "partner_total_earnings",
    "signup_bonus_sum",
    "qrr_sum",
    "partner_referrals",
    "non_fixture_commissions",
  ];
  return numericKeys.every((key) => Math.abs(Number(delta[key] || 0)) < 0.001);
}

async function deleteScopedCommissionRow(service, commissionId) {
  await service.from("partner_service_commission_reversals").delete().eq("commission_id", commissionId);
  await service.from("partner_financial_risk_holds").delete().eq("commission_id", commissionId);
  const { error } = await service.from("partner_commissions").delete().eq("id", commissionId);
  return !error;
}

async function loadScopedPartnerContext(service, registry, sinceIso) {
  const partnerIds = [...new Set(registry?.partnerIds || [])];
  const partnerCreatedAt = new Map();
  const partnerUserId = new Map();
  for (let i = 0; i < partnerIds.length; i += 50) {
    const chunk = partnerIds.slice(i, i + 50);
    const { data: partners } = await service
      .from("partners")
      .select("id, user_id, created_at")
      .in("id", chunk);
    for (const p of partners || []) {
      if (String(p.created_at || "") < sinceIso) continue;
      partnerCreatedAt.set(p.id, p.created_at);
      if (p.user_id) partnerUserId.set(p.id, p.user_id);
    }
  }
  return { partnerCreatedAt, partnerUserId };
}

function commissionLinkedToPreGateFixture(commission, registry, partnerUserId, partnerCreatedAt, sinceIso) {
  if (!commission?.id) return false;
  if (String(commission.created_at || "") < sinceIso) return false;
  const blob = [
    commission.idempotency_key,
    commission.reason,
    commission.source_ref,
    commission.source_id,
    commission.description,
  ]
    .map((v) => String(v || ""))
    .join("|");
  if (/sc-probe|mc-probe|hv-pass3-|hv-pregate-|r6-|r7-|r8_|r8-|r9_|r9-/i.test(blob)) return true;
  if (!commission.partner_id) return false;
  if (!partnerCreatedAt.has(commission.partner_id)) return false;
  if (commission.referral_id && registry.referralIds?.includes(commission.referral_id)) return true;
  const uid = partnerUserId.get(commission.partner_id);
  if (uid && registry.authUserIds?.includes(uid)) return true;
  return false;
}

function qrrCreditLinkedToPreGateFixture(credit, registry, partnerUserId, partnerCreatedAt, sinceIso) {
  if (!credit?.id) return false;
  if (String(credit.created_at || "") < sinceIso) return false;
  if (credit.referral_id && registry.referralIds?.includes(credit.referral_id)) return true;
  if (!credit.partner_id) return false;
  if (partnerCreatedAt.has(credit.partner_id)) return true;
  const uid = partnerUserId.get(credit.partner_id);
  return Boolean(uid && registry.authUserIds?.includes(uid));
}

function emptySourceBucket() {
  return {
    balance_pending: 0,
    balance_bonus_pending: 0,
    total_earnings: 0,
    ledger_signed: 0,
    items: 0,
  };
}

/** Canonical SC01/service reversal — commission row, reversal row, or ledger idempotency link. */
export async function isCommissionCanonicallyReversed(service, { commissionId = null, ledgerCreditId = null } = {}) {
  if (commissionId) {
    const { data: comm } = await service
      .from("partner_commissions")
      .select("id, status")
      .eq("id", commissionId)
      .maybeSingle();
    if (comm?.status === "reversed" || comm?.status === "rejected") {
      return { alreadyReversed: true, reason: "commission_status", commissionId };
    }
    const { count: svcRevCount } = await service
      .from("partner_service_commission_reversals")
      .select("id", { count: "exact", head: true })
      .eq("commission_id", commissionId);
    if (svcRevCount) {
      return { alreadyReversed: true, reason: "service_reversal_row", commissionId };
    }
  }

  let ledgerId = ledgerCreditId;
  if (!ledgerId && commissionId) {
    const ledger = await findLedgerCreditForCommission(service, commissionId);
    ledgerId = ledger?.id || null;
  }
  if (ledgerId) {
    const { count } = await service
      .from("partner_financial_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", `ledger:reversal:${ledgerId}`);
    if (count) {
      return { alreadyReversed: true, reason: "ledger_reversal_idempotency", commissionId, ledgerCreditId: ledgerId };
    }
  }

  return { alreadyReversed: false, commissionId, ledgerCreditId: ledgerId };
}

export function initSourceReconciliation() {
  return {
    sc01: emptySourceBucket(),
    r6_signup_bonus: emptySourceBucket(),
    r7_signup_bonus: emptySourceBucket(),
    r7_qrr: emptySourceBucket(),
  };
}

function classifyCommissionSource(commission = {}) {
  const blob = [commission.idempotency_key, commission.reason, commission.source_ref, commission.description]
    .map((v) => String(v || ""))
    .join("|");
  if (/sc-probe|:sc:1/i.test(blob)) return "sc01";
  if (commission.source_type === "signup_bonus") {
    if (/r6-|r6_|r6-staging/i.test(blob)) return "r6_signup_bonus";
    return "r7_signup_bonus";
  }
  if (commission.source_type === "service" && /sc-probe|:sc:1/i.test(blob)) return "sc01";
  return null;
}

async function capturePartnerEconomic(service, partnerId) {
  const { data: partner } = await service
    .from("partners")
    .select("balance_pending, balance_bonus_pending, total_earnings")
    .eq("id", partnerId)
    .maybeSingle();
  return {
    balance_pending: Number(partner?.balance_pending || 0),
    balance_bonus_pending: Number(partner?.balance_bonus_pending || 0),
    total_earnings: Number(partner?.total_earnings || 0),
    ledger_signed: await sumPartnerLedgerSigned(service, partnerId),
  };
}

function accumulateSourceDelta(sourceReconciliation, sourceKey, before, after) {
  if (!sourceKey || !sourceReconciliation[sourceKey]) return;
  const bucket = sourceReconciliation[sourceKey];
  bucket.balance_pending = roundMoney(bucket.balance_pending + (after.balance_pending - before.balance_pending));
  bucket.balance_bonus_pending = roundMoney(
    bucket.balance_bonus_pending + (after.balance_bonus_pending - before.balance_bonus_pending)
  );
  bucket.total_earnings = roundMoney(bucket.total_earnings + (after.total_earnings - before.total_earnings));
  bucket.ledger_signed = roundMoney(bucket.ledger_signed + (after.ledger_signed - before.ledger_signed));
  bucket.items += 1;
}

async function cleanupOrphanProbeLedgerCredits(service, sinceIso, reason, report) {
  report.probeOrphans = [];
  report.sc01Orphan = {
    detected: false,
    reversalApplied: false,
    balancePendingDelta: 0,
    totalEarningsDelta: 0,
    reason: null,
    entries: [],
  };

  const { data: orphanCommissions, error: commErr } = await service
    .from("partner_commissions")
    .select("id, partner_id, status, source_type, idempotency_key, amount, reason, created_at")
    .gte("created_at", sinceIso)
    .or("idempotency_key.ilike.%sc-probe%,idempotency_key.ilike.%:sc:1%,reason.ilike.%sc-probe%");
  if (commErr) throw commErr;

  const handledCommissionIds = new Set();
  for (const comm of orphanCommissions || []) {
    if (comm.source_type === "signup_bonus") continue;

    const canonical = await isCommissionCanonicallyReversed(service, { commissionId: comm.id });
    if (canonical.alreadyReversed) {
      report.sc01Orphan.detected = true;
      handledCommissionIds.add(comm.id);
      report.probeOrphans.push({
        commissionId: comm.id,
        partnerId: comm.partner_id,
        idempotencyKey: comm.idempotency_key,
        outcome: "already_reversed",
        reason: canonical.reason,
      });
      continue;
    }

    report.sc01Orphan.detected = true;
    handledCommissionIds.add(comm.id);

    const { data: partnerBefore } = await service
      .from("partners")
      .select("balance_pending, total_earnings")
      .eq("id", comm.partner_id)
      .maybeSingle();
    const pendingBefore = Number(partnerBefore?.balance_pending || 0);
    const earningsBefore = Number(partnerBefore?.total_earnings || 0);

    const ledger = await findLedgerCreditForCommission(service, comm.id);
    let ledgerReversed = false;
    if (ledger?.id) {
      const { count } = await service
        .from("partner_financial_ledger_entries")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", `ledger:reversal:${ledger.id}`);
      ledgerReversed = (count || 0) > 0;
    }

    let result;
    if (ledgerReversed) {
      result = await reversePartnerServiceCommissionLedgerAlreadyReversed(service, comm.id, {
        reason,
        ledgerEntryId: ledger?.id,
      });
    } else {
      result = await reversePartnerServiceCommissionAtomic(service, { commissionId: comm.id, reason });
      if (result.reversed && result.ledgerEntryId) report.ledgerRowsCreated += 1;
    }

    const { data: partnerAfter } = await service
      .from("partners")
      .select("balance_pending, total_earnings")
      .eq("id", comm.partner_id)
      .maybeSingle();
    const pendingAfter = Number(partnerAfter?.balance_pending || 0);
    const earningsAfter = Number(partnerAfter?.total_earnings || 0);
    report.sc01Orphan.balancePendingDelta = roundMoney(pendingAfter - pendingBefore);
    report.sc01Orphan.totalEarningsDelta = roundMoney(earningsAfter - earningsBefore);
    if (report.sourceReconciliation) {
      accumulateSourceDelta(
        report.sourceReconciliation,
        "sc01",
        {
          balance_pending: pendingBefore,
          balance_bonus_pending: 0,
          total_earnings: earningsBefore,
          ledger_signed: 0,
        },
        {
          balance_pending: pendingAfter,
          balance_bonus_pending: 0,
          total_earnings: earningsAfter,
          ledger_signed: 0,
        }
      );
    }

    if (result?.reversed || result?.outcome === "reversed") {
      report.sc01Orphan.reversalApplied = true;
    }

    report.probeOrphans.push({
      commissionId: comm.id,
      partnerId: comm.partner_id,
      idempotencyKey: comm.idempotency_key,
      outcome: result?.outcome || (result?.reversed ? "reversed" : result?.duplicate ? "duplicate" : "unknown"),
      detail: result,
    });
    report.sc01Orphan.entries.push({
      commissionId: comm.id,
      partnerId: comm.partner_id,
      idempotencyKey: comm.idempotency_key,
    });
  }

  const { data: credits, error } = await service
    .from("partner_financial_ledger_entries")
    .select("id, partner_id, amount, balance_bucket, legacy_commission_id, idempotency_key")
    .gte("created_at", sinceIso)
    .eq("entry_direction", "credit")
    .or("idempotency_key.ilike.%sc-probe%,idempotency_key.ilike.%mc-probe%,idempotency_key.ilike.%:sc:1%");
  if (error) throw error;

  for (const credit of credits || []) {
    if (credit.legacy_commission_id && handledCommissionIds.has(credit.legacy_commission_id)) continue;
    const revKey = `ledger:reversal:${credit.id}`;
    const { count: reversalCount } = await service
      .from("partner_financial_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", revKey);

    if (credit.legacy_commission_id) {
      const { data: comm } = await service
        .from("partner_commissions")
        .select("id, status, source_type")
        .eq("id", credit.legacy_commission_id)
        .maybeSingle();
      if (comm?.id && comm.status !== "reversed" && comm.status !== "rejected") {
        if (comm.source_type === "signup_bonus") {
          await reversePartnerSignupBonusCommissionEconomically(service, comm.id, { reason });
        } else if (reversalCount) {
          await reversePartnerServiceCommissionLedgerAlreadyReversed(service, comm.id, {
            reason,
            ledgerEntryId: credit.id,
          });
        } else {
          await reversePartnerServiceCommissionAtomic(service, { commissionId: comm.id, reason });
        }
        report.probeOrphans.push({ ledgerId: credit.id, commissionId: comm.id, outcome: "commission_reversed" });
        continue;
      }
    }

    if (reversalCount) {
      report.probeOrphans.push({
        ledgerId: credit.id,
        legacyCommissionId: credit.legacy_commission_id,
        outcome: "already_reversed",
        reason: "ledger_reversal_idempotency",
      });
      continue;
    }

    const rev = await reversePartnerLedgerEntryAtomic(service, credit.id, reason);
    if (rev.reversed) report.ledgerRowsCreated += 1;
    await restorePartnerBalancesAfterLedgerCreditReversal(service, {
      partnerId: credit.partner_id,
      amount: credit.amount,
      balanceBucket: credit.balance_bucket || "pending",
    });
    report.probeOrphans.push({ ledgerId: credit.id, outcome: rev.reversed ? "ledger_and_balance" : "duplicate" });
  }

  const { data: ledgerWithComm, error: ledgerCommErr } = await service
    .from("partner_financial_ledger_entries")
    .select("id, partner_id, amount, balance_bucket, legacy_commission_id, idempotency_key")
    .gte("created_at", sinceIso)
    .eq("entry_direction", "credit")
    .not("legacy_commission_id", "is", null);
  if (ledgerCommErr) throw ledgerCommErr;

  for (const credit of ledgerWithComm || []) {
    if (handledCommissionIds.has(credit.legacy_commission_id)) continue;
    const { data: comm } = await service
      .from("partner_commissions")
      .select("id, status, source_type, idempotency_key, reason")
      .eq("id", credit.legacy_commission_id)
      .maybeSingle();
    if (comm?.id && comm.status !== "reversed" && comm.status !== "rejected") continue;

    const isSc01Like =
      /sc-probe|:sc:1/i.test(String(comm?.idempotency_key || "")) ||
      /sc-probe|:sc:1/i.test(String(comm?.reason || "")) ||
      (Number(credit.amount) === 10 && credit.balance_bucket === "pending" && !comm?.id);

    if (!isSc01Like) continue;

    const canonical = await isCommissionCanonicallyReversed(service, {
      commissionId: credit.legacy_commission_id,
      ledgerCreditId: credit.id,
    });
    if (canonical.alreadyReversed) {
      report.sc01Orphan.detected = true;
      report.probeOrphans.push({
        ledgerId: credit.id,
        legacyCommissionId: credit.legacy_commission_id,
        outcome: "already_reversed",
        reason: canonical.reason,
      });
      continue;
    }

    report.sc01Orphan.detected = true;
    const revKey = `ledger:reversal:${credit.id}`;
    const { count: reversalCount } = await service
      .from("partner_financial_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", revKey);

    if (reversalCount) {
      report.probeOrphans.push({
        ledgerId: credit.id,
        legacyCommissionId: credit.legacy_commission_id,
        outcome: "already_reversed",
        reason: "ledger_reversal_idempotency",
      });
      continue;
    }

    const { data: partnerBefore } = await service
      .from("partners")
      .select("balance_pending, total_earnings")
      .eq("id", credit.partner_id)
      .maybeSingle();

    if (!reversalCount) {
      const rev = await reversePartnerLedgerEntryAtomic(service, credit.id, reason);
      if (rev.reversed) report.ledgerRowsCreated += 1;
    }

    await restorePartnerBalancesAfterLedgerCreditReversal(service, {
      partnerId: credit.partner_id,
      amount: credit.amount,
      balanceBucket: credit.balance_bucket || "pending",
    });
    report.sc01Orphan.reversalApplied = true;

    const { data: partnerAfter } = await service
      .from("partners")
      .select("balance_pending, total_earnings")
      .eq("id", credit.partner_id)
      .maybeSingle();
    report.sc01Orphan.balancePendingDelta = roundMoney(
      Number(partnerAfter?.balance_pending || 0) - Number(partnerBefore?.balance_pending || 0)
    );
    report.sc01Orphan.totalEarningsDelta = roundMoney(
      Number(partnerAfter?.total_earnings || 0) - Number(partnerBefore?.total_earnings || 0)
    );
    report.probeOrphans.push({
      ledgerId: credit.id,
      legacyCommissionId: credit.legacy_commission_id,
      outcome: "deleted_commission_orphan",
    });
  }
}

/**
 * Scoped pre-gate economic cleanup — commissions + QRR credits only.
 * No ledger DELETE, no purgeRunCommissionsRpc, no direct harness balance SQL.
 */
export async function cleanupPreGateFinancialArtifacts(service, { registry, sinceIso, runTag = "pregate-cleanup" } = {}) {
  const report = {
    sinceIso,
    commissions: [],
    qrrCredits: [],
    ledgerRowsCreated: 0,
    commissionsCleaned: 0,
    qrrCreditsCleaned: 0,
    bySource: { service: 0, signup_bonus: 0, qrr: 0, other: 0 },
    skippedHistorical: 0,
    probeOrphans: [],
    sourceReconciliation: initSourceReconciliation(),
  };
  if (!sinceIso) {
    report.skipped = true;
    report.reason = "missing_sinceIso";
    return report;
  }

  const { partnerCreatedAt, partnerUserId } = await loadScopedPartnerContext(service, registry || {}, sinceIso);
  const reason = runTag || registry?.runTag || "pregate-cleanup";

  if (registry?.partnerIds?.length) {
    const { data: sinceCommissions, error: sinceCommErr } = await service
      .from("partner_commissions")
      .select(
        "id, partner_id, referral_id, amount, status, source_type, created_at, idempotency_key, reason, source_ref, source_id, description, is_withdrawable, qualification_credited_at"
      )
      .gte("created_at", sinceIso)
      .limit(5000);
    if (sinceCommErr) throw sinceCommErr;

    const scopedCommissions = (sinceCommissions || []).filter((commission) =>
      commissionLinkedToPreGateFixture(commission, registry, partnerUserId, partnerCreatedAt, sinceIso)
    );

    for (const commission of scopedCommissions) {
      const sourceKey = classifyCommissionSource(commission);
      const economicBefore = commission.partner_id
        ? await capturePartnerEconomic(service, commission.partner_id)
        : null;
      if (commission.status === "reversed" || commission.status === "rejected") {
        const restore = await restorePartnerServiceCommissionBalanceAfterLedgerNetZero(service, commission.id, {
          reason,
        });
        const deleted = await deleteScopedCommissionRow(service, commission.id);
        report.commissions.push({
          id: commission.id,
          source_type: commission.source_type,
          outcome: deleted ? "already_reversed_deleted" : "delete_failed",
          amount: Number(commission.amount || 0),
          balanceRestore: restore?.outcome || null,
        });
        if (deleted) report.commissionsCleaned += 1;
        if (economicBefore && commission.partner_id) {
          const economicAfter = await capturePartnerEconomic(service, commission.partner_id);
          accumulateSourceDelta(report.sourceReconciliation, sourceKey, economicBefore, economicAfter);
        }
        continue;
      }

      let result;
      if (commission.source_type === "signup_bonus") {
        result = await reversePartnerSignupBonusCommissionEconomically(service, commission.id, { reason });
        report.bySource.signup_bonus += 1;
      } else {
        const ledger = await findLedgerCreditForCommission(service, commission.id);
        const ledgerReversed = ledger?.id
          ? await service
              .from("partner_financial_ledger_entries")
              .select("id", { count: "exact", head: true })
              .eq("idempotency_key", `ledger:reversal:${ledger.id}`)
              .then(({ count }) => (count || 0) > 0)
          : false;

        if (ledgerReversed) {
          result = await reversePartnerServiceCommissionLedgerAlreadyReversed(service, commission.id, {
            reason,
            ledgerEntryId: ledger?.id,
          });
        } else {
          result = await reversePartnerServiceCommissionAtomic(service, {
            commissionId: commission.id,
            reason,
          });
          if (result.reversed && result.ledgerEntryId) report.ledgerRowsCreated += 1;
        }
        report.bySource.service += 1;
      }

      const deleted = await deleteScopedCommissionRow(service, commission.id);
      report.commissions.push({
        id: commission.id,
        source_type: commission.source_type,
        outcome: result?.outcome || (result?.reversed ? "reversed" : result?.duplicate ? "already_reversed" : "unknown"),
        amount: Number(commission.amount || 0),
        deleted,
        detail: result,
      });
      if (deleted) report.commissionsCleaned += 1;
      if (result?.ledgerReversed) report.ledgerRowsCreated += 1;
      if (economicBefore && commission.partner_id) {
        const economicAfter = await capturePartnerEconomic(service, commission.partner_id);
        accumulateSourceDelta(report.sourceReconciliation, sourceKey, economicBefore, economicAfter);
      }
    }

    const { data: sinceQrrCredits, error: qrrErr } = await service
      .from("partner_qualified_referral_reward_credits")
      .select("id, partner_id, referral_id, amount, status, ledger_entry_id, created_at")
      .gte("created_at", sinceIso)
      .limit(5000);
    if (qrrErr) throw qrrErr;

    for (const credit of sinceQrrCredits || []) {
      if (!qrrCreditLinkedToPreGateFixture(credit, registry, partnerUserId, partnerCreatedAt, sinceIso)) continue;
      const economicBefore = credit.partner_id ? await capturePartnerEconomic(service, credit.partner_id) : null;
      if (credit.status !== "credited") {
        await service.from("partner_qualified_referral_reward_credits").delete().eq("id", credit.id);
        report.qrrCredits.push({ id: credit.id, outcome: "already_reversed_deleted" });
        report.qrrCreditsCleaned += 1;
        continue;
      }
      const result = await reversePartnerQualifiedReferralRewardEconomically(service, credit.id, { reason });
      report.bySource.qrr += 1;
      if (result.ledgerReversed) report.ledgerRowsCreated += 1;
      await service.from("partner_qualified_referral_reward_credits").delete().eq("id", credit.id);
      report.qrrCredits.push({
        id: credit.id,
        outcome: result.outcome,
        amount: Number(credit.amount || 0),
        detail: result,
      });
      report.qrrCreditsCleaned += 1;
      if (economicBefore && credit.partner_id) {
        const economicAfter = await capturePartnerEconomic(service, credit.partner_id);
        accumulateSourceDelta(report.sourceReconciliation, "r7_qrr", economicBefore, economicAfter);
      }
    }
  }

  await cleanupOrphanProbeLedgerCredits(service, sinceIso, reason, report);

  return report;
}

export async function reversePreGateLedgerCreditsForRegistry(service, registry, sinceIso, runTag = "pregate-cleanup") {
  if (!sinceIso || !registry?.partnerIds?.length) return { reversed: 0, skipped: 0, orphanedReversalsPrevented: 0 };
  let reversed = 0;
  let skipped = 0;
  const partnerIds = registry.partnerIds;
  for (let i = 0; i < partnerIds.length; i += 50) {
    const chunk = partnerIds.slice(i, i + 50);
    const { data: partners } = await service.from("partners").select("id, created_at").in("id", chunk);
    const scopedPartnerIds = (partners || [])
      .filter((p) => String(p.created_at || "") >= sinceIso)
      .map((p) => p.id);
    if (!scopedPartnerIds.length) continue;
    const { data: rows } = await service
      .from("partner_financial_ledger_entries")
      .select("id, entry_type, entry_direction, created_at, legacy_commission_id")
      .in("partner_id", scopedPartnerIds)
      .gte("created_at", sinceIso)
      .neq("entry_type", "reversal")
      .eq("entry_direction", "credit");
    for (const row of rows || []) {
      if (row.entry_type === "qualified_referral_reward" || row.entry_type === "signup_bonus") {
        skipped += 1;
        continue;
      }
      const revKey = `ledger:reversal:${row.id}`;
      const { count } = await service
        .from("partner_financial_ledger_entries")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", revKey);
      if (count) {
        skipped += 1;
        continue;
      }
      if (row.legacy_commission_id) {
        const { data: comm } = await service
          .from("partner_commissions")
          .select("status")
          .eq("id", row.legacy_commission_id)
          .maybeSingle();
        if (comm?.status === "reversed" || comm?.status === "rejected") {
          skipped += 1;
          continue;
        }
        const { count: svcRevCount } = await service
          .from("partner_service_commission_reversals")
          .select("id", { count: "exact", head: true })
          .eq("commission_id", row.legacy_commission_id);
        if (svcRevCount) {
          skipped += 1;
          continue;
        }
      }
      try {
        const res = await reversePartnerLedgerEntryAtomic(service, row.id, runTag);
        if (res.reversed || res.duplicate) reversed += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
  }
  return { reversed, skipped };
}

async function verifyExplicitSuiteResidue(service, registry) {
  const partnerIds = registry?.partnerIds || [];
  const r7PartnerIds = [];
  const r8PartnerIds = [];
  if (partnerIds.length) {
    for (let i = 0; i < partnerIds.length; i += 100) {
      const chunk = partnerIds.slice(i, i + 100);
      const { data: partners } = await service.from("partners").select("id, user_id").in("id", chunk);
      const userIds = (partners || []).map((p) => p.user_id).filter(Boolean);
      if (!userIds.length) continue;
      const { data: profiles } = await service.from("profiles").select("id, email").in("id", userIds);
      for (const p of profiles || []) {
        const email = String(p.email || "").toLowerCase();
        const partnerRow = (partners || []).find((row) => row.user_id === p.id);
        if (!partnerRow) continue;
        if (/^r7-|r7-ref-/i.test(email)) r7PartnerIds.push(partnerRow.id);
        if (/r8_|r8-/i.test(email)) r8PartnerIds.push(partnerRow.id);
      }
    }
  }

  async function signedNetForPartners(ids) {
    if (!ids.length) return 0;
    let net = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const { data } = await service
        .from("partner_financial_ledger_entries")
        .select("amount, entry_direction")
        .in("partner_id", chunk);
      for (const row of data || []) {
        const amt = Number(row.amount || 0);
        net += row.entry_direction === "debit" ? -amt : amt;
      }
    }
    return net;
  }

  const r7SignedNet = await signedNetForPartners(r7PartnerIds);
  const r8SignedNet = await signedNetForPartners(r8PartnerIds);
  return {
    r7: { partnerIds: r7PartnerIds.length, signedNet: r7SignedNet, economicNetZero: Math.abs(r7SignedNet) < 0.001 },
    r8: { partnerIds: r8PartnerIds.length, signedNet: r8SignedNet, economicNetZero: Math.abs(r8SignedNet) < 0.001 },
  };
}

export async function purgePreGateStagingFixtures(
  service,
  report = {},
  { sinceIso = null, preGateRunRegistry = null, authRetryStats = null, reverseLedger = false } = {}
) {
  const stats = authRetryStats || createAuthRetryStats();
  report.authRetryStats = stats;

  let registry = await buildPreGateRegistryFromDiscovery(service, { sinceIso, preGateRunRegistry, strictSince: Boolean(sinceIso) });
  if (!registry.partnerIds.length && !registry.authUserIds.length) {
    const fallbackUsers = await discoverPreGateFixtureUsersAuthFallback(service, { stats, sinceIso }).catch(() => []);
    if (fallbackUsers.length) {
      registry = mergePreGateRunRegistries(registry, await buildPreGateRegistryFromUsers(service, fallbackUsers));
    }
  }

  report.preGateCleanup = {
    discoverySource: stats.fallbackUsed ? "profiles+auth_fallback" : "profiles",
    discoveredUsers: registry.authUserIds.length,
    partnerIds: registry.partnerIds.length,
    referralIds: registry.referralIds.length,
    registryCounts: {
      authUserIds: registry.authUserIds.length,
      profileIds: registry.profileIds.length,
      partnerIds: registry.partnerIds.length,
      referralIds: registry.referralIds.length,
      commissionIds: registry.commissionIds.length,
      ledgerIds: registry.ledgerIds.length,
    },
  };

  if (!registry.partnerIds.length && !registry.authUserIds.length) {
    report.preGateCleanup.skipped = true;
    report.preGateRunRegistry = registry;
    return report;
  }

  const runStartedAt = sinceIso || null;
  if (!runStartedAt) {
    report.preGateCleanup.skipped = true;
    report.preGateCleanup.reason = "requires_runStartedAt_for_scoped_financial_cleanup";
    report.preGateRunRegistry = registry;
    return report;
  }
  if (reverseLedger) {
    report.preGateCleanup.commissionCleanup = await cleanupPreGateFinancialArtifacts(service, {
      registry,
      sinceIso: runStartedAt,
      runTag: registry.runTag,
    });
    report.preGateCleanup.ledgerReversal = await reversePreGateLedgerCreditsForRegistry(
      service,
      registry,
      runStartedAt,
      registry.runTag
    );
  } else {
    report.preGateCleanup.commissionCleanup = await cleanupPreGateFinancialArtifacts(service, {
      registry,
      sinceIso: runStartedAt,
      runTag: registry.runTag,
    });
  }
  // Pre-gate cleanup: atomic ledger reversal only — no ledger DELETE (append-only contract).
  report.preGateCleanup.purgeRpc = { skipped: true, reason: "pregate_uses_atomic_reversal_only" };
  await cleanupRunRegistry(service, registry, report, {
    runStartedAt,
    skipFinancialReverse: true,
    skipPurgeRpc: true,
  });
  report.preGateCleanup.removedUsers = registry.authUserIds.length;
  report.preGateRunRegistry = registry;
  report.preGateCleanup.suiteResidue = await verifyExplicitSuiteResidue(service, registry);
  return report;
}

export async function purgeStaleStagingHarnessFixtures(service, { extraRunTag = null, sinceIso = null, authRetryStats = null } = {}) {
  const stats = authRetryStats || createAuthRetryStats();
  return withTransientRetry(
    async () => {
      const report = {};
      report.pass3Purge = await purgeAllPass3StagingFixtures(service, { extraRunTag });
      report.blockerPurge = await purgePriorBlockerFixtures(service);
      report.pass3PurgeFinal = await purgeAllPass3StagingFixtures(service, { extraRunTag });
      return report;
    },
    { stats, label: "purgeStaleStagingHarnessFixtures" }
  );
}

export async function runPreGateReconciliation(
  service,
  finBefore,
  report = {},
  { sinceIso = null, preGateRunRegistry = null, authRetryStats = null } = {}
) {
  const stats = authRetryStats || createAuthRetryStats();
  const cleanupReport = {};
  await purgePreGateStagingFixtures(service, cleanupReport, {
    sinceIso: sinceIso || finBefore?.capturedAt || null,
    preGateRunRegistry,
    authRetryStats: stats,
    reverseLedger: true,
  });
  Object.assign(report, cleanupReport);

  const finAfter = await financialBaselineStrict(service);
  finAfter.capturedAt = new Date().toISOString();
  const keys = Object.keys(finBefore || {});
  const { delta, exact } = compareFinancialSnapshots(finBefore, finAfter, keys);
  const residue = await countActivePass3FixtureResidue(service);
  const suiteResidue = report.preGateCleanup?.suiteResidue || (await verifyExplicitSuiteResidue(service, report.preGateRunRegistry || {}));

  report.preGateReconciliation = {
    finBefore,
    finAfter,
    delta,
    exact,
    reconciliationExact: exact,
    activeResidue: residue,
    activeResidueZero: activeFixtureResidueZero(residue),
    suiteResidue,
    authRetryStats: stats,
  };

  report.preGateReconciliation.pass =
    exact &&
    preGateDeltaKeysOk(delta) &&
    activeFixtureResidueZero(residue) &&
    suiteResidue.r7.economicNetZero &&
    suiteResidue.r8.economicNetZero;

  return report.preGateReconciliation;
}

export function preGateReconciliationOk(result) {
  return result?.pass === true && result?.reconciliationExact === true;
}

export async function captureFinancialSnapshot(service) {
  const snap = await financialBaselineStrict(service);
  snap.capturedAt = new Date().toISOString();
  return snap;
}

/** Scoped R7-only cleanup before standalone R7 run — no ledger DELETE, no balance UPDATE. */
export async function purgeActiveR7StagingFixturesScoped(service, report = {}) {
  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, email, created_at")
    .like("email", "r7-%")
    .limit(500);
  if (error) throw error;
  const users = (profiles || [])
    .filter((p) => /^r7-/i.test(String(p.email || "")) && String(p.email || "").endsWith("@staging-hcw.test"))
    .map((p) => ({ id: p.id, email: p.email, created_at: p.created_at }));
  if (!users.length) {
    report.skipped = true;
    report.reason = "no_active_r7_profiles";
    return report;
  }
  const registry = await buildPreGateRegistryFromUsers(service, users);
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  report.registryCounts = {
    authUserIds: registry.authUserIds.length,
    partnerIds: registry.partnerIds.length,
    referralIds: registry.referralIds.length,
  };
  report.purgeRpc = await purgeRunCommissionsRpc(service, registry.partnerIds, sinceIso);
  await cleanupRunRegistry(service, registry, report, { runStartedAt: sinceIso, skipFinancialReverse: true });
  report.removedUsers = users.length;
  return report;
}

export async function captureRowBaseline(service) {
  const fin = await financialBaselineStrict(service);
  const { count: partners } = await service.from("partners").select("id", { count: "exact", head: true });
  return {
    partners: partners || 0,
    partner_referrals: fin.partner_referrals || 0,
    partner_commissions: fin.partner_commissions || 0,
    partner_financial_ledger_entries: fin.partner_financial_ledger_entries || 0,
    partner_fraud_assessments: fin.partner_fraud_assessments || 0,
    account_risk_signals: fin.account_risk_signals || 0,
    partner_reward_entitlements: fin.partner_reward_entitlements || 0,
    partner_mission_progress: fin.partner_mission_progress || 0,
    partner_campaign_participants: fin.partner_campaign_participants || 0,
    ledger_signed_sum: fin.ledger_signed_sum || 0,
    commission_sum: fin.commission_sum || 0,
    balance_pending: fin.partner_balance_pending || 0,
    balance_bonus_pending: fin.partner_balance_bonus_pending || 0,
    balance_withdrawable: fin.partner_balance_withdrawable || 0,
    total_earnings: fin.partner_total_earnings || 0,
  };
}

export function rowBaselineDelta(before = {}, after = {}) {
  const keys = [
    "partners",
    "partner_referrals",
    "partner_commissions",
    "partner_financial_ledger_entries",
    "partner_fraud_assessments",
    "account_risk_signals",
    "partner_reward_entitlements",
    "partner_mission_progress",
    "partner_campaign_participants",
  ];
  const delta = {};
  for (const key of keys) {
    delta[key] = Number(after[key] || 0) - Number(before[key] || 0);
  }
  return delta;
}

export function probeLifecycleZeroOk(before = {}, after = {}) {
  const delta = rowBaselineDelta(before, after);
  return Object.values(delta).every((v) => Number(v) === 0);
}

/** Isolated-only append-only purge for probe/suite residue after economic net-zero proof. */
export async function purgeIsolatedHarnessBusinessResidue(service, { userIds = [], partnerIds = [] } = {}) {
  if (process.env.HV_VALIDATION_TARGET !== "isolated") {
    return { skipped: true, reason: "not_isolated" };
  }
  const { loadIsolatedHarnessEnv } = await import("../lib/isolated-env-guard.js");
  const pg = (await import("pg")).default;
  const target = loadIsolatedHarnessEnv();
  const password = process.env.ISOLATED_SUPABASE_DB_PASSWORD;
  if (!password) return { skipped: true, reason: "missing_db_password" };

  const { data: allPartners } = await service.from("partners").select("id, user_id");
  const allPartnerIds = [...new Set([...partnerIds, ...(allPartners || []).map((p) => p.id)])];
  const allUserIds = [...new Set([...userIds, ...(allPartners || []).map((p) => p.user_id).filter(Boolean)])];

  let referralIds = [];
  if (allPartnerIds.length || allUserIds.length) {
    const filters = [];
    if (allUserIds.length) filters.push(`referred_user_id.in.(${allUserIds.join(",")})`);
    if (allPartnerIds.length) filters.push(`partner_id.in.(${allPartnerIds.join(",")})`);
    const { data: referralRows } = await service.from("partner_referrals").select("id").or(filters.join(","));
    referralIds = (referralRows || []).map((r) => r.id);
  }

  const client = new pg.Client({
    connectionString: `postgresql://postgres.${target.projectRef}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query("set session_replication_role = replica");
  try {
    if (referralIds.length) {
      await client.query(`delete from partner_qualified_referral_reward_credits where referral_id = any($1::uuid[])`, [referralIds]);
      await client.query(`delete from partner_referral_qualifications where referral_id = any($1::uuid[])`, [referralIds]);
      await client.query(`delete from partner_referral_attributions where referral_id = any($1::uuid[])`, [referralIds]);
      await client.query(`delete from partner_fraud_assessments where referral_id = any($1::uuid[])`, [referralIds]);
      await client.query(`delete from partner_referrals where id = any($1::uuid[])`, [referralIds]);
    }
    if (allPartnerIds.length) {
      await client.query(
        `delete from partner_service_commission_reversals where commission_id in (select id from partner_commissions where partner_id = any($1::uuid[]))`,
        [allPartnerIds]
      );
      await client.query(`delete from partner_service_commission_entitlements where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_reward_entitlements where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_mission_progress where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_campaign_participants where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_financial_risk_holds where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_wallet_ledger where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_financial_ledger_entries where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_commissions where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partner_fraud_assessments where partner_id = any($1::uuid[])`, [allPartnerIds]);
      await client.query(`delete from partners where id = any($1::uuid[])`, [allPartnerIds]);
    }
    if (allUserIds.length) {
      await client.query(`delete from account_risk_signals where user_id = any($1::uuid[])`, [allUserIds]);
      await client.query(`delete from partner_referrals where referred_user_id = any($1::uuid[])`, [allUserIds]);
      await client.query(`delete from profiles where id = any($1::uuid[])`, [allUserIds]);
    }
    await client.query(`delete from partner_financial_ledger_entries`);
    await client.query(`delete from partner_fraud_assessments`);
    await client.query(`delete from partner_mission_definitions where code like 'P3MIS%'`);
    await client.query(`delete from partner_campaign_programs where code like 'P3C%'`);
    const orphanRes = await client.query(`
      DELETE FROM auth.identities i
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = i.user_id)
        AND coalesce(i.identity_data->>'email', '') ilike '%@%.test'
    `);
    const authRemoved = await deleteHarnessFixtureAuthUsers(service);
    return {
      partners: allPartnerIds.length,
      users: allUserIds.length,
      referrals: referralIds.length,
      orphanIdentities: orphanRes.rowCount || 0,
      authUsersRemoved: authRemoved,
    };
  } finally {
    await client.query("set session_replication_role = default");
    await client.end();
  }
}

export async function finalizeProbeZeroBaseline(service, { probeTag = null, userIds = [], partnerIds = [] } = {}) {
  await purgeAllPass3StagingFixtures(service, { extraRunTag: probeTag });
  const pgPurge = await purgeIsolatedHarnessBusinessResidue(service, { userIds, partnerIds });
  for (const uid of userIds) {
    await service.auth.admin.deleteUser(uid).catch(() => null);
  }
  const after = await captureRowBaseline(service);
  return { pgPurge, after, ok: probeLifecycleZeroOk({}, after) };
}

export async function assertInterSuiteIsolationZero(service, label = "inter_suite") {
  const snap = await captureRowBaseline(service);
  const economicZero =
    Number(snap.ledger_signed_sum || 0) === 0 &&
    Number(snap.commission_sum || 0) === 0 &&
    Number(snap.balance_pending || 0) === 0 &&
    Number(snap.balance_bonus_pending || 0) === 0 &&
    Number(snap.balance_withdrawable || 0) === 0 &&
    Number(snap.total_earnings || 0) === 0;

  const strictRows =
    process.env.HV_VALIDATION_TARGET !== "isolated" ||
    (Number(snap.partners || 0) === 0 &&
      Number(snap.partner_referrals || 0) === 0 &&
      Number(snap.partner_commissions || 0) === 0 &&
      Number(snap.partner_financial_ledger_entries || 0) === 0 &&
      Number(snap.partner_fraud_assessments || 0) === 0 &&
      Number(snap.account_risk_signals || 0) === 0 &&
      Number(snap.partner_reward_entitlements || 0) === 0 &&
      Number(snap.partner_mission_progress || 0) === 0 &&
      Number(snap.partner_campaign_participants || 0) === 0);

  return {
    label,
    ok: economicZero && strictRows,
    economicZero,
    strictRows,
    snap,
  };
}

export async function guaranteedR8OrchestrationCleanup(service, { reason = "orchestrator" } = {}) {
  const {
    purgeActiveR8StagingFixturesScoped,
    clearStagingFailureFlags,
    purgeOrphanAuthIdentitiesForHarnessPatterns,
    discoverActiveR8FixturePartnerIds,
    reverseR8FixtureCommissionsEconomically,
  } = await import("./partner-center/r8-staging-harness-lib.mjs");

  const report = { reason, steps: [] };
  await clearStagingFailureFlags(service);
  report.steps.push({ step: "clearStagingFailureFlags", ok: true });

  const discovered = await discoverActiveR8FixturePartnerIds(service, { sinceIso: null });
  const { data: allPartners } = await service.from("partners").select("id");
  const partnerIds = [...new Set([...discovered.partnerIds, ...(allPartners || []).map((p) => p.id)])];

  if (partnerIds.length) {
    await reverseR8FixtureCommissionsEconomically(service, {
      partnerIds,
      sinceIso: null,
      reason: "r8_orchestrator_cleanup",
    });
    report.steps.push({ step: "reverseR8FixtureCommissionsEconomically", partners: partnerIds.length });
    const scoped = {};
    await purgeActiveR8StagingFixturesScoped(service, scoped, { partnerIds, sinceIso: null });
    report.steps.push({ step: "purgeActiveR8StagingFixturesScoped", ...scoped });
  }

  const pgPurge = await purgeIsolatedHarnessBusinessResidue(service);
  report.steps.push({ step: "purgeIsolatedHarnessBusinessResidue", ...pgPurge });

  const orphan = await purgeOrphanAuthIdentitiesForHarnessPatterns().catch((err) => ({
    deleted: 0,
    error: String(err?.message || err),
  }));
  report.steps.push({ step: "purgeOrphanAuthIdentitiesForHarnessPatterns", ...orphan });

  report.interSuite = await assertInterSuiteIsolationZero(service, "after_r8_orchestrator_cleanup");
  report.r8ActiveResidueZero = report.interSuite.strictRows;
  report.r8EconomicExposureZero = report.interSuite.economicZero;
  report.ok = report.r8ActiveResidueZero && report.r8EconomicExposureZero;
  return report;
}
