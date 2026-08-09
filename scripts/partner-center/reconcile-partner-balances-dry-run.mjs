#!/usr/bin/env node
/**
 * Partner balance reconciliation — DRY RUN report only.
 */
import { createPartnerTestDb, query } from "./test-db.mjs";
import { roundMoney } from "../../lib/partner-center/money.js";

export async function reconcilePartnerBalancesDryRun(db, partnerId) {
  const partner = await query(db, `
    SELECT id, balance_pending, balance_withdrawable, balance_bonus_pending, total_earnings, total_withdrawn
    FROM partners WHERE id = $1
  `, [partnerId]);

  if (!partner.rows[0]) {
    return { partnerId, status: "INVALID", reason: "partner_not_found" };
  }

  const ledger = await query(db, `
    SELECT entry_direction, amount, balance_bucket, lifecycle_status
    FROM partner_financial_ledger_entries WHERE partner_id = $1
  `, [partnerId]);

  const legacy = partner.rows[0];
  const derived = { pending: 0, withdrawable: 0, bonusPending: 0, paidOut: 0 };

  for (const row of ledger.rows) {
    const amt = Number(row.amount || 0);
    const signed = row.entry_direction === "debit" ? -amt : amt;
    if (row.balance_bucket === "pending") derived.pending += signed;
    if (row.balance_bucket === "withdrawable") derived.withdrawable += signed;
    if (row.balance_bucket === "bonus_pending") derived.bonusPending += signed;
    if (row.balance_bucket === "paid_out") derived.paidOut += signed;
  }

  Object.keys(derived).forEach((k) => {
    derived[k] = roundMoney(derived[k]);
  });

  const legacyView = {
    pending: roundMoney(legacy.balance_pending),
    withdrawable: roundMoney(legacy.balance_withdrawable),
    bonusPending: roundMoney(legacy.balance_bonus_pending),
    earningsTotal: roundMoney(legacy.total_earnings),
    paidOut: roundMoney(legacy.total_withdrawn),
  };

  const pendingMatch = legacyView.pending === derived.pending;
  const withdrawableMatch = legacyView.withdrawable === derived.withdrawable;
  const bonusMatch = legacyView.bonusPending === derived.bonusPending;

  let status = "MATCH";
  if (!pendingMatch || !withdrawableMatch || !bonusMatch) {
    status = "DIFFERENCE";
  }
  if (ledger.rows.length === 0 && (legacyView.pending > 0 || legacyView.withdrawable > 0)) {
    status = "AMBIGUOUS";
  }

  return {
    partnerId,
    status,
    legacy: legacyView,
    derived,
    breakdown: {
      pendingMatch,
      withdrawableMatch,
      bonusMatch,
      ledgerEntryCount: ledger.rows.length,
    },
    cutoverNote:
      "Ledger-native writes tagged metadata.source=ledger_native; backfill uses legacy_commission:{id}; never double-count both.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.STAGING_VALIDATION === "1") {
    const { createStagingClients, assertStagingOnly } = await import("./staging-supabase-client.mjs");
    assertStagingOnly();
    const { service } = createStagingClients();
    const { data: partners } = await service.from("partners").select("id").limit(5);
    const reports = [];
    for (const p of partners || []) {
      reports.push(await reconcilePartnerBalancesDryRunStaging(service, p.id));
    }
    const summary = {
      target: "staging",
      partnersChecked: reports.length,
      MATCH: reports.filter((r) => r.status === "MATCH").length,
      DIFFERENCE: reports.filter((r) => r.status === "DIFFERENCE").length,
      AMBIGUOUS: reports.filter((r) => r.status === "AMBIGUOUS").length,
      reports,
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const db = await createPartnerTestDb();
    const report = await reconcilePartnerBalancesDryRun(db, "11111111-1111-1111-1111-111111111111");
    console.log(JSON.stringify(report, null, 2));
    await db.close();
  }
}

export async function reconcilePartnerBalancesDryRunStaging(service, partnerId) {
  const { data: partner, error: pErr } = await service
    .from("partners")
    .select("id, balance_pending, balance_withdrawable, balance_bonus_pending, total_earnings, total_withdrawn")
    .eq("id", partnerId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!partner) return { partnerId, status: "INVALID", reason: "partner_not_found" };

  const { data: ledger, error: lErr } = await service
    .from("partner_financial_ledger_entries")
    .select("entry_direction, amount, balance_bucket, lifecycle_status")
    .eq("partner_id", partnerId);
  if (lErr) throw lErr;

  const derived = { pending: 0, withdrawable: 0, bonusPending: 0, paidOut: 0 };
  for (const row of ledger || []) {
    const amt = Number(row.amount || 0);
    const signed = row.entry_direction === "debit" ? -amt : amt;
    if (row.balance_bucket === "pending") derived.pending += signed;
    if (row.balance_bucket === "withdrawable") derived.withdrawable += signed;
    if (row.balance_bucket === "bonus_pending") derived.bonusPending += signed;
    if (row.balance_bucket === "paid_out") derived.paidOut += signed;
  }
  Object.keys(derived).forEach((k) => {
    derived[k] = roundMoney(derived[k]);
  });

  const legacyView = {
    pending: roundMoney(partner.balance_pending),
    withdrawable: roundMoney(partner.balance_withdrawable),
    bonusPending: roundMoney(partner.balance_bonus_pending),
    earningsTotal: roundMoney(partner.total_earnings),
    paidOut: roundMoney(partner.total_withdrawn),
  };

  const pendingMatch = legacyView.pending === derived.pending;
  const withdrawableMatch = legacyView.withdrawable === derived.withdrawable;
  const bonusMatch = legacyView.bonusPending === derived.bonusPending;

  let status = "MATCH";
  if (!pendingMatch || !withdrawableMatch || !bonusMatch) status = "DIFFERENCE";
  if ((ledger || []).length === 0 && (legacyView.pending > 0 || legacyView.withdrawable > 0)) {
    status = "AMBIGUOUS";
  }

  return {
    partnerId,
    status,
    legacy: legacyView,
    derived,
    breakdown: {
      pendingMatch,
      withdrawableMatch,
      bonusMatch,
      ledgerEntryCount: (ledger || []).length,
    },
    cutoverNote:
      "Ledger-native writes tagged metadata.source=ledger_native; backfill uses legacy_commission:{id}; never double-count both.",
  };
}
