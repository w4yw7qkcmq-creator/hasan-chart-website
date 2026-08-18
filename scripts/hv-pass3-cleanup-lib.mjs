/**
 * Scoped Pass 3 staging fixture cleanup — hv-pass3-* and known run metadata only.
 */
import { isStagingRegressionFixtureEmail } from "./hv-pass3-rc01-forensics-lib.mjs";

export const KNOWN_PASS3_RUN_PREFIXES = [
  "hv-pass3-1786518763706",
  "hv-pass3-1786520218883",
  "hv-pass3-1786522060592",
  "hv-pass3-1786522519445",
  "hv-pass3-1786522854101",
];

function softDelete(label, result, report) {
  if (result?.error) {
    report.steps.push({ label, skipped: true, error: result.error.message || result.error.code });
    return false;
  }
  report.steps.push({ label, ok: true });
  return true;
}

async function tableCount(service, table) {
  const { count, error } = await service.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function sumColumn(service, table, column) {
  const { data, error } = await service.from(table).select(column);
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + Number(row[column] || 0), 0);
}

async function sumLedgerSigned(service, fixturePartnerIds = []) {
  const { data, error } = await service
    .from("partner_financial_ledger_entries")
    .select("amount, entry_direction, partner_id");
  if (error) throw error;
  const fixtureSet = new Set(fixturePartnerIds);
  return (data || []).reduce((sum, row) => {
    if (fixturePartnerIds.length && fixtureSet.has(row.partner_id)) return sum;
    const amt = Number(row.amount || 0);
    return sum + (row.entry_direction === "debit" ? -amt : amt);
  }, 0);
}

async function resolveFixturePartnerIds(service) {
  const ids = new Set();
  const { data: profiles, error: profileErr } = await service
    .from("profiles")
    .select("id, email")
    .like("email", "%@staging-hcw.test")
    .limit(5000);
  if (profileErr) throw profileErr;
  const fixtureUserIds = (profiles || [])
    .filter((p) => isStagingRegressionFixtureEmail(p.email) || String(p.email || "").includes("hv-pass3-"))
    .map((p) => p.id);
  if (fixtureUserIds.length) {
    const { data: partners, error } = await service.from("partners").select("id").in("user_id", fixtureUserIds);
    if (error) throw error;
    for (const p of partners || []) ids.add(p.id);
  }

  const { data: fixtureCommissions, error: commErr } = await service
    .from("partner_commissions")
    .select("partner_id, idempotency_key, reason, source_ref")
    .or(
      "idempotency_key.ilike.%sc-probe%,idempotency_key.ilike.%mc-probe%,idempotency_key.ilike.%hv-pregate-%,idempotency_key.ilike.%hv-pass3-%,reason.ilike.%sc-probe%,reason.ilike.%mc-probe%,reason.ilike.%hv-pregate-%"
    )
    .limit(5000);
  if (commErr) throw commErr;
  for (const row of fixtureCommissions || []) {
    if (row.partner_id) ids.add(row.partner_id);
  }

  const { data: fixtureLedger, error: ledgerErr } = await service
    .from("partner_financial_ledger_entries")
    .select("partner_id, idempotency_key")
    .or(
      "idempotency_key.ilike.%sc-probe%,idempotency_key.ilike.%mc-probe%,idempotency_key.ilike.%hv-pregate-%,idempotency_key.ilike.%ledger:signup_bonus:%"
    )
    .limit(5000);
  if (ledgerErr) throw ledgerErr;
  for (const row of fixtureLedger || []) {
    if (row.partner_id) ids.add(row.partner_id);
  }

  return [...ids];
}

async function countNonFixtureFinancial(service, table, column, fixturePartnerIds) {
  const selectCols =
    table === "partner_commissions"
      ? column
        ? `${column},amount_reversed,status,partner_id`
        : "id,amount_reversed,status,partner_id"
      : column
        ? `${column},partner_id`
        : "partner_id";
  const { data, error } = await service.from(table).select(selectCols);
  if (error) throw error;
  const fixtureSet = new Set(fixturePartnerIds);
  const rows = (data || []).filter((row) => !fixtureSet.has(row.partner_id));
  const activeCommissionAmount = (row) =>
    Math.max(0, Number(row.amount || 0) - Number(row.amount_reversed || 0));
  const economicallyActive = (row) =>
    !["reversed", "rejected"].includes(String(row.status || "")) && activeCommissionAmount(row) > 0;
  if (!column) return rows.length;
  if (table === "partner_commissions") {
    return {
      count: rows.filter(economicallyActive).length,
      sum: rows.filter(economicallyActive).reduce((sum, row) => sum + activeCommissionAmount(row), 0),
    };
  }
  return {
    count: rows.length,
    sum: rows.reduce((sum, row) => sum + Number(row[column] || 0), 0),
  };
}

export async function financialBaselineStrict(service) {
  const fixturePartnerIds = await resolveFixturePartnerIds(service);
  const [
    partner_commissions,
    partner_financial_ledger_entries,
    partner_wallet_ledger,
    partner_financial_risk_holds,
    partner_reward_entitlements,
    partner_fraud_assessments,
    account_risk_signals,
    partner_mission_progress,
    partner_campaign_participants,
    partner_referrals,
    _rawCommissionSum,
    ledger_sum,
    ledger_signed_sum,
    wallet_sum,
    risk_hold_sum,
    non_fixture_commissions,
    non_fixture_ledger,
    nfCommissionSumResult,
    nfLedgerSumResult,
  ] = await Promise.all([
    tableCount(service, "partner_commissions"),
    tableCount(service, "partner_financial_ledger_entries"),
    tableCount(service, "partner_wallet_ledger"),
    tableCount(service, "partner_financial_risk_holds"),
    tableCount(service, "partner_reward_entitlements"),
    tableCount(service, "partner_fraud_assessments"),
    tableCount(service, "account_risk_signals"),
    tableCount(service, "partner_mission_progress"),
    tableCount(service, "partner_campaign_participants"),
    tableCount(service, "partner_referrals"),
    sumColumn(service, "partner_commissions", "amount"),
    sumColumn(service, "partner_financial_ledger_entries", "amount"),
    sumLedgerSigned(service),
    sumColumn(service, "partner_wallet_ledger", "amount"),
    tableCount(service, "partner_financial_risk_holds"),
    countNonFixtureFinancial(service, "partner_commissions", null, fixturePartnerIds),
    countNonFixtureFinancial(service, "partner_financial_ledger_entries", null, fixturePartnerIds),
    countNonFixtureFinancial(service, "partner_commissions", "amount", fixturePartnerIds),
    sumLedgerSigned(service, fixturePartnerIds),
  ]);
  const non_fixture_commission_sum = nfCommissionSumResult.sum;
  const non_fixture_ledger_sum = nfLedgerSumResult;

  const { data: commissionsByType, error: typeErr } = await service
    .from("partner_commissions")
    .select("amount, amount_reversed, source_type, status");
  if (typeErr) throw typeErr;
  const activeCommissionAmount = (row) =>
    Math.max(0, Number(row.amount || 0) - Number(row.amount_reversed || 0));
  const economicallyActive = (row) =>
    !["reversed", "rejected"].includes(String(row.status || "")) && activeCommissionAmount(row) > 0;
  const commission_sum = (commissionsByType || [])
    .filter(economicallyActive)
    .reduce((s, r) => s + activeCommissionAmount(r), 0);
  const qrr_sum = (commissionsByType || [])
    .filter((r) => r.source_type === "qualified_referral_reward" && economicallyActive(r))
    .reduce((s, r) => s + activeCommissionAmount(r), 0);
  const signup_bonus_sum = (commissionsByType || [])
    .filter((r) => r.source_type === "signup_bonus" && economicallyActive(r))
    .reduce((s, r) => s + activeCommissionAmount(r), 0);

  const { data: partners, error: partnerErr } = await service
    .from("partners")
    .select("balance_pending, balance_bonus_pending, balance_withdrawable, total_earnings, total_withdrawn");
  if (partnerErr) throw partnerErr;
  const partner_balance_pending = (partners || []).reduce((s, r) => s + Number(r.balance_pending || 0), 0);
  const partner_balance_bonus_pending = (partners || []).reduce((s, r) => s + Number(r.balance_bonus_pending || 0), 0);
  const partner_balance_withdrawable = (partners || []).reduce((s, r) => s + Number(r.balance_withdrawable || 0), 0);
  const partner_total_earnings = (partners || []).reduce((s, r) => s + Number(r.total_earnings || 0), 0);
  const partner_total_withdrawn = (partners || []).reduce((s, r) => s + Number(r.total_withdrawn || 0), 0);

  return {
    partner_commissions,
    partner_financial_ledger_entries,
    partner_wallet_ledger,
    partner_financial_risk_holds,
    partner_reward_entitlements,
    partner_fraud_assessments,
    account_risk_signals,
    partner_mission_progress,
    partner_campaign_participants,
    partner_referrals,
    commission_sum,
    ledger_sum,
    ledger_signed_sum,
    wallet_sum,
    risk_hold_sum,
    qrr_sum,
    signup_bonus_sum,
    partner_balance_pending,
    partner_balance_bonus_pending,
    partner_balance_withdrawable,
    partner_total_earnings,
    partner_total_withdrawn,
    non_fixture_commissions,
    non_fixture_ledger,
    non_fixture_commission_sum,
    non_fixture_ledger_sum,
  };
}

export async function purgeRunCommissionsRpc(service, partnerIds, runStartedAt) {
  const uniquePartnerIds = [...new Set((partnerIds || []).filter(Boolean))];
  if (!uniquePartnerIds.length) return { deleted: 0 };
  const { data, error } = await service.rpc("partner_center_staging_purge_run_commissions", {
    p_partner_ids: uniquePartnerIds,
    p_since: runStartedAt || null,
  });
  if (error) return { deleted: null, error: error.message || error.code };
  return data || { deleted: 0 };
}

export async function countPass3FixtureResidue(service) {
  const active = await countActivePass3FixtureResidue(service);
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  const fixtureUsers = (users?.users || []).filter((u) => u.email?.includes("hv-pass3-"));
  return {
    ...active,
    fixture_auth_users: fixtureUsers.length,
    listed_orphan_users: fixtureUsers.length,
    fixture_profiles: active.active_fixture_profiles,
    fixture_entitlements: active.active_fixture_entitlements,
    fixture_risk_signals: active.active_fixture_risk_signals,
  };
}

export async function countActivePass3FixtureResidue(service, { runTag = null } = {}) {
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  const historical_auth_users = (users?.users || []).filter((u) => u.email?.includes("hv-pass3-")).length;

  const { count: active_fixture_profiles } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .like("email", "%hv-pass3-%");

  const { count: entMeta } = await service
    .from("partner_reward_entitlements")
    .select("id", { count: "exact", head: true })
    .filter("metadata->>run", "like", "%hv-pass3-%");
  const { count: entKey } = await service
    .from("partner_reward_entitlements")
    .select("id", { count: "exact", head: true })
    .ilike("idempotency_key", "%hv-pass3-%");
  let active_fixture_entitlements = Number(entMeta || 0) + Number(entKey || 0);
  if (runTag) {
    const { count: entRunMeta } = await service
      .from("partner_reward_entitlements")
      .select("id", { count: "exact", head: true })
      .filter("metadata->>run", "eq", runTag);
    const { count: entRunKey } = await service
      .from("partner_reward_entitlements")
      .select("id", { count: "exact", head: true })
      .ilike("idempotency_key", `%${runTag}%`);
    active_fixture_entitlements += Number(entRunMeta || 0) + Number(entRunKey || 0);
  }

  const { count: active_fixture_risk_signals } = await service
    .from("account_risk_signals")
    .select("id", { count: "exact", head: true })
    .filter("metadata->>run", "like", "%hv-pass3-%");

  const { data: p3Missions } = await service.from("partner_mission_definitions").select("id").like("code", "P3MIS%");
  const missionIds = (p3Missions || []).map((row) => row.id).filter(Boolean);
  let active_fixture_mission_progress = 0;
  if (missionIds.length) {
    const { count } = await service
      .from("partner_mission_progress")
      .select("id", { count: "exact", head: true })
      .in("mission_id", missionIds);
    active_fixture_mission_progress = count || 0;
  }

  const { data: p3Campaigns } = await service.from("partner_campaign_programs").select("id").like("code", "P3C%");
  const campaignIds = (p3Campaigns || []).map((row) => row.id).filter(Boolean);
  let active_fixture_campaign_participants = 0;
  if (campaignIds.length) {
    const { count } = await service
      .from("partner_campaign_participants")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds);
    active_fixture_campaign_participants = count || 0;
  }

  const { count: active_pending_rewards } = await service
    .from("partner_reward_entitlements")
    .select("id", { count: "exact", head: true })
    .filter("metadata->>run", "like", "%hv-pass3-%")
    .in("status", ["pending", "risk_hold", "earned"]);

  return {
    active_fixture_profiles: active_fixture_profiles || 0,
    active_fixture_entitlements,
    active_fixture_risk_signals: active_fixture_risk_signals || 0,
    active_fixture_mission_progress,
    active_fixture_campaign_participants,
    active_pending_rewards: active_pending_rewards || 0,
    historical_auth_users,
  };
}

export function activeFixtureResidueZero(residue) {
  return [
    "active_fixture_profiles",
    "active_fixture_entitlements",
    "active_fixture_risk_signals",
    "active_fixture_mission_progress",
    "active_fixture_campaign_participants",
    "active_pending_rewards",
  ].every((key) => Number(residue?.[key] || 0) === 0);
}

export async function purgeAllPass3StagingFixtures(service, { extraRunTag = null } = {}) {
  const report = { removedUsers: 0, steps: [] };
  const emailLike = `%hv-pass3-%`;

  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const orphanUsers = (list?.users || []).filter((u) => {
    const email = String(u.email || "");
    return email.includes("hv-pass3-") || email.includes("hv-blocker-") || (extraRunTag && email.includes(extraRunTag));
  });
  const orphanUserIds = orphanUsers.map((u) => u.id);
  const orphanPartnerIds = [];

  for (const uid of orphanUserIds) {
    const { data: partners } = await service.from("partners").select("id").eq("user_id", uid);
    for (const p of partners || []) orphanPartnerIds.push(p.id);
  }

  const partnerIdSet = [...new Set(orphanPartnerIds)];

  if (partnerIdSet.length) {
    await purgeRunCommissionsRpc(service, partnerIdSet, null);
  }

  for (const pid of partnerIdSet) {
    softDelete("partner_commissions", await service.from("partner_commissions").delete().eq("partner_id", pid), report);
    softDelete(
      "partner_financial_ledger_entries",
      await service.from("partner_financial_ledger_entries").delete().eq("partner_id", pid),
      report
    );
    softDelete("partner_wallet_ledger", await service.from("partner_wallet_ledger").delete().eq("partner_id", pid), report);
    softDelete("partner_mission_progress", await service.from("partner_mission_progress").delete().eq("partner_id", pid), report);
    softDelete("partner_campaign_participants", await service.from("partner_campaign_participants").delete().eq("partner_id", pid), report);
    softDelete("partner_qualified_referral_reward_credits", await service.from("partner_qualified_referral_reward_credits").delete().eq("partner_id", pid), report);
    softDelete("partner_service_commission_entitlements", await service.from("partner_service_commission_entitlements").delete().eq("partner_id", pid), report);
    softDelete("partner_reward_entitlements", await service.from("partner_reward_entitlements").delete().eq("partner_id", pid), report);
    softDelete("partner_fraud_assessments", await service.from("partner_fraud_assessments").delete().eq("partner_id", pid), report);
    softDelete("partner_financial_risk_holds", await service.from("partner_financial_risk_holds").delete().eq("partner_id", pid), report);
    softDelete("partner_referrals", await service.from("partner_referrals").delete().eq("partner_id", pid), report);
    softDelete("partners", await service.from("partners").delete().eq("id", pid), report);
  }

  for (const uid of orphanUserIds) {
    softDelete("partner_referral_qualifications", await service.from("partner_referral_qualifications").delete().eq("referred_user_id", uid), report);
    softDelete("account_risk_signals", await service.from("account_risk_signals").delete().eq("user_id", uid), report);
    softDelete("partner_referrals.referred", await service.from("partner_referrals").delete().eq("referred_user_id", uid), report);
    softDelete("profiles", await service.from("profiles").delete().eq("id", uid), report);
    await service.auth.admin.deleteUser(uid).catch(() => null);
    report.removedUsers += 1;
  }

  softDelete("mission_defs", await service.from("partner_mission_definitions").delete().like("code", "P3MIS%"), report);
  softDelete("campaigns", await service.from("partner_campaign_programs").delete().like("code", "P3C%"), report);
  softDelete("profiles_like", await service.from("profiles").delete().like("email", emailLike), report);
  softDelete(
    "risk_signals_hv_pass3",
    await service.from("account_risk_signals").delete().filter("metadata->>run", "like", "%hv-pass3-%"),
    report
  );
  softDelete(
    "entitlements_hv_pass3_meta",
    await service.from("partner_reward_entitlements").delete().filter("metadata->>run", "like", "%hv-pass3-%"),
    report
  );
  softDelete(
    "entitlements_hv_pass3_key",
    await service.from("partner_reward_entitlements").delete().ilike("idempotency_key", "%hv-pass3-%"),
    report
  );

  report.residue = await countActivePass3FixtureResidue(service, { runTag: extraRunTag });
  report.residue.legacyPartnerUsers = report.residue.historical_auth_users;
  return report;
}
