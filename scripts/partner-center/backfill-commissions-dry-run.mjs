#!/usr/bin/env node
/**
 * Historical partner_commissions backfill — DRY RUN (read-only default).
 * Usage: node scripts/partner-center/backfill-commissions-dry-run.mjs [--execute] [--json]
 */
import { createPartnerTestDb, query } from "./test-db.mjs";

const EXECUTE = process.argv.includes("--execute");

export function classifyLegacyCommission(commission, existingLedger) {
  const idempotencyKey = `legacy_commission:${commission.id}`;

  if (existingLedger) {
    const ledgerAmount = Number(existingLedger.amount || 0);
    const legacyAmount = Number(commission.amount || 0);
    if (Math.abs(ledgerAmount - legacyAmount) > 0.001) {
      return {
        status: "CONFLICT",
        reason: "amount_mismatch",
        idempotencyKey,
        legacyAmount,
        ledgerAmount,
      };
    }
    return { status: "ALREADY_MAPPED", idempotencyKey, ledgerEntryId: existingLedger.id };
  }

  if (!commission.partner_id || !commission.id) {
    return { status: "INVALID", reason: "missing_partner_or_commission_id", idempotencyKey };
  }

  if (commission.amount == null || Number(commission.amount) < 0) {
    return { status: "AMBIGUOUS", reason: "invalid_amount", idempotencyKey };
  }

  if (!commission.source_type && !commission.service_type) {
    return { status: "AMBIGUOUS", reason: "missing_source_classification", idempotencyKey };
  }

  return {
    status: "READY_TO_BACKFILL",
    idempotencyKey,
    suggestedLedgerStatus: mapLegacyStatusToLedger(commission.status),
    suggestedBucket: commission.source_type === "signup_bonus" ? "bonus_pending" : "pending",
  };
}

export function mapLegacyStatusToLedger(status) {
  switch (String(status || "").toLowerCase()) {
    case "withdrawable":
    case "approved":
      return "payable";
    case "paid":
      return "paid";
    case "rejected":
      return "reversed";
    default:
      return "pending";
  }
}

export async function dryRunBackfillCommissions(db) {
  const commissions = await query(db, `
    SELECT id, partner_id, referral_id, user_id, source_type, service_type, amount, status, created_at, idempotency_key
    FROM partner_commissions ORDER BY created_at ASC
  `);

  const ledger = await query(db, `
    SELECT id, legacy_commission_id, amount, idempotency_key, metadata
    FROM partner_financial_ledger_entries
    WHERE legacy_commission_id IS NOT NULL
  `);

  const ledgerByCommission = new Map(
    ledger.rows.map((row) => [String(row.legacy_commission_id), row])
  );

  const report = {
    mode: EXECUTE ? "execute" : "dry_run",
    total: commissions.rows.length,
    counts: { ALREADY_MAPPED: 0, READY_TO_BACKFILL: 0, INVALID: 0, AMBIGUOUS: 0, CONFLICT: 0 },
    items: [],
  };

  for (const commission of commissions.rows) {
    const existing = ledgerByCommission.get(String(commission.id));
    const classification = classifyLegacyCommission(commission, existing);
    report.counts[classification.status] = (report.counts[classification.status] || 0) + 1;
    report.items.push({ commissionId: commission.id, ...classification });
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let db;
  let close = async () => {};
  if (process.env.STAGING_VALIDATION === "1") {
    const { createStagingClients, assertStagingOnly } = await import("./staging-supabase-client.mjs");
    assertStagingOnly();
    const { service } = createStagingClients();
    db = {
      async query(_sql, _params) {
        throw new Error("Use dryRunBackfillCommissions(service) for staging");
      },
      service,
    };
    close = async () => {};
    const report = await dryRunBackfillCommissionsStaging(service);
    console.log(JSON.stringify(report, null, 2));
  } else {
    db = await createPartnerTestDb();
    close = () => db.close();
    await query(db, `
      INSERT INTO auth.users (id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ON CONFLICT DO NOTHING
    `);
    await query(db, `
      INSERT INTO partners (id, user_id, referral_code) VALUES
      ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TEST1')
      ON CONFLICT DO NOTHING
    `);
    const report = await dryRunBackfillCommissions(db);
    console.log(JSON.stringify(report, null, 2));
  }
  await close();
}

export async function dryRunBackfillCommissionsStaging(service) {
  const { data: commissions, error: cErr } = await service
    .from("partner_commissions")
    .select("id, partner_id, referral_id, user_id, source_type, service_type, amount, status, created_at, idempotency_key")
    .order("created_at", { ascending: true });
  if (cErr) throw cErr;

  const { data: ledger, error: lErr } = await service
    .from("partner_financial_ledger_entries")
    .select("id, legacy_commission_id, amount, idempotency_key, metadata")
    .not("legacy_commission_id", "is", null);
  if (lErr) throw lErr;

  const ledgerByCommission = new Map(
    (ledger || []).map((row) => [String(row.legacy_commission_id), row])
  );

  const report = {
    mode: "dry_run",
    target: "staging",
    total: (commissions || []).length,
    counts: { ALREADY_MAPPED: 0, READY_TO_BACKFILL: 0, INVALID: 0, AMBIGUOUS: 0, CONFLICT: 0 },
    items: [],
  };

  for (const commission of commissions || []) {
    const existing = ledgerByCommission.get(String(commission.id));
    const classification = classifyLegacyCommission(commission, existing);
    report.counts[classification.status] = (report.counts[classification.status] || 0) + 1;
    report.items.push({ commissionId: commission.id, ...classification });
  }

  return report;
}
