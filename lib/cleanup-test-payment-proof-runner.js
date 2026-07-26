/**
 * DB/Storage discovery + dry-run/execute runner for test payment-proof cleanup.
 */

import {
  assertExecuteAllowed,
  assertExplicitRequestIds,
  buildCleanupPlan,
  buildStorageTarget,
  evaluateWithdrawalBlockers,
  KNOWN_REFERENCE_SPECS,
  parseCleanupArgs,
  previewCommissionReversal,
  reverseTestCommissionForCleanup,
  summarizePartnerBalances,
} from "./cleanup-test-payment-proof-data.js";
import {
  assessSettlementStateForRequest,
  previewCommissionCleanupEligibility,
} from "./settle-test-partner-financials.js";
import {
  hashPaymentProofContent,
  PAYMENT_PROOF_BUCKET,
  validatePaymentProofFileBuffer,
} from "./payment-proof-storage.js";

async function inspectStorageObject(supabase, objectPath) {
  const { data, error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).download(objectPath);
  if (error) {
    return { exists: false, error: error.message || String(error) };
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  const validation = validatePaymentProofFileBuffer(buffer);
  return {
    exists: true,
    bytes: buffer.length,
    contentHash: hashPaymentProofContent(buffer),
    validationCode: validation.ok ? null : validation.code,
    width: validation.width ?? null,
    height: validation.height ?? null,
  };
}

async function fetchByFilter(supabase, table, applyFilter, columns = "*", limit = 500) {
  let query = supabase.from(table).select(columns).limit(limit);
  query = applyFilter(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message || error}`);
  return data || [];
}

async function resolveProfileUserIds(supabase, rowsById) {
  const emails = [
    ...new Set(
      Object.values(rowsById)
        .map((row) => String(row.user_email || "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (!emails.length) return new Map();

  const { data, error } = await supabase.from("profiles").select("id,email").in("email", emails);
  if (error) throw error;

  const byEmail = new Map();
  for (const profile of data || []) {
    byEmail.set(String(profile.email || "").trim().toLowerCase(), profile.id);
  }
  return byEmail;
}

export async function discoverTestPaymentProofReferences(supabase, requestIds, rowsById) {
  const idStrings = requestIds.map(String);
  const profilesByEmail = await resolveProfileUserIds(supabase, rowsById);
  const userIds = [...new Set([...profilesByEmail.values()].filter(Boolean))];
  const references = {};

  references.subscription_requests = {
    table: "subscription_requests",
    referenceType: "primary_row",
    fkEnforced: false,
    rowIds: requestIds.filter((id) => rowsById[id]),
    rowCount: requestIds.filter((id) => rowsById[id]).length,
    cleanupAction: "delete_row",
  };

  const uploadSessions = await fetchByFilter(
    supabase,
    "subscription_upload_sessions",
    (q) => q.in("subscription_request_id", requestIds),
    "id,subscription_request_id,object_path,status,user_email,created_at"
  );
  references.subscription_upload_sessions = {
    table: "subscription_upload_sessions",
    referenceType: "subscription_request_id",
    fkEnforced: false,
    rowIds: uploadSessions.map((row) => row.id),
    rowCount: uploadSessions.length,
    rows: uploadSessions,
    cleanupAction: "delete_rows",
  };

  const commissions = await fetchByFilter(
    supabase,
    "partner_commissions",
    (q) => q.or(`subscription_id.in.(${idStrings.join(",")}),source_ref.in.(${idStrings.join(",")})`),
    "id,partner_id,subscription_id,source_ref,amount,currency,status,is_withdrawable,service_type,created_at"
  );
  references.partner_commissions = {
    table: "partner_commissions",
    referenceType: "subscription_id|source_ref",
    fkEnforced: false,
    rowIds: commissions.map((row) => row.id),
    rowCount: commissions.length,
    rows: commissions,
    cleanupAction: "reject_then_delete",
  };

  const commissionIds = commissions.map((row) => row.id);
  const ledgerRows = commissionIds.length
    ? await fetchByFilter(
        supabase,
        "partner_wallet_ledger",
        (q) => q.eq("reference_type", "commission").in("reference_id", commissionIds),
        "id,partner_id,type,amount,reference_type,reference_id,created_at"
      )
    : [];
  references.partner_wallet_ledger = {
    table: "partner_wallet_ledger",
    referenceType: "commission_reference",
    fkEnforced: true,
    rowIds: ledgerRows.map((row) => row.id),
    rowCount: ledgerRows.length,
    rows: ledgerRows,
    cleanupAction: "delete_rows",
  };

  const adminLogs = await fetchByFilter(
    supabase,
    "admin_logs",
    (q) => q.eq("target_table", "subscription_requests").in("target_id", idStrings),
    "id,action,target_id,admin_email,created_at"
  );
  references.admin_logs = {
    table: "admin_logs",
    referenceType: "target_id",
    fkEnforced: false,
    rowIds: adminLogs.map((row) => row.id),
    rowCount: adminLogs.length,
    rows: adminLogs,
    cleanupAction: "delete_rows",
  };

  const notifications = [];
  for (const id of idStrings) {
    const rows = await fetchByFilter(
      supabase,
      "notifications",
      (q) => q.eq("metadata->>subscriptionRequestId", id),
      "id,type,user_email,created_at,metadata",
      100
    );
    notifications.push(...rows);
  }
  const uniqueNotifications = [...new Map(notifications.map((row) => [row.id, row])).values()];
  references.notifications = {
    table: "notifications",
    referenceType: "metadata.subscriptionRequestId",
    fkEnforced: false,
    rowIds: uniqueNotifications.map((row) => row.id),
    rowCount: uniqueNotifications.length,
    rows: uniqueNotifications,
    cleanupAction: "delete_rows",
  };

  const outboxRows = [];
  for (const id of idStrings) {
    const rows = await fetchByFilter(
      supabase,
      "email_outbox",
      (q) =>
        q.or(
          `metadata->>subscriptionRequestId.eq.${id},idempotency_key.eq.subscription_rejected:${id},idempotency_key.eq.subscription_ended:${id},idempotency_key.eq.subscription_activated:${id}`
        ),
      "id,message_type,status,recipient_email,created_at,metadata,idempotency_key",
      100
    );
    outboxRows.push(...rows);
  }
  const uniqueOutbox = [...new Map(outboxRows.map((row) => [row.id, row])).values()];
  references.email_outbox = {
    table: "email_outbox",
    referenceType: "metadata.subscriptionRequestId|idempotency_key",
    fkEnforced: false,
    rowIds: uniqueOutbox.map((row) => row.id),
    rowCount: uniqueOutbox.length,
    rows: uniqueOutbox,
    cleanupAction: "delete_rows",
  };

  const notes = userIds.length
    ? await fetchByFilter(
        supabase,
        "admin_user_notes",
        (q) => q.in("user_id", userIds),
        "id,user_id,created_at,is_pinned"
      )
    : [];
  references.admin_user_notes = {
    table: "admin_user_notes",
    referenceType: "user_id",
    fkEnforced: false,
    rowIds: notes.map((row) => row.id),
    rowCount: notes.length,
    rows: notes,
    cleanupAction: "delete_test_user_notes",
  };

  const referrals = userIds.length
    ? await fetchByFilter(
        supabase,
        "partner_referrals",
        (q) => q.in("referred_user_id", userIds),
        "id,partner_id,referred_user_id,status,created_at"
      )
    : [];
  references.partner_referrals = {
    table: "partner_referrals",
    referenceType: "referred_user_id",
    fkEnforced: false,
    rowIds: referrals.map((row) => row.id),
    rowCount: referrals.length,
    rows: referrals,
    cleanupAction: "delete_test_referrals",
  };

  const partnerIds = [...new Set(commissions.map((row) => row.partner_id).filter(Boolean))];
  const withdrawalRows = partnerIds.length
    ? await fetchByFilter(
        supabase,
        "partner_withdrawals",
        (q) => q.in("partner_id", partnerIds),
        "id,partner_id,amount,status,created_at,paid_at"
      )
    : [];
  references.partner_withdrawals = {
    table: "partner_withdrawals",
    referenceType: "partner_balance_blocker",
    fkEnforced: false,
    rowIds: withdrawalRows.map((row) => row.id),
    rowCount: withdrawalRows.length,
    rows: withdrawalRows,
    cleanupAction: "blocker_check_only",
  };

  const pathRefs = [];
  for (const row of Object.values(rowsById)) {
    const path = String(row.payment_proof_path || "").trim();
    if (!path) continue;
    const samePathRows = await fetchByFilter(
      supabase,
      "subscription_requests",
      (q) => q.eq("payment_proof_path", path),
      "id,payment_proof_path,user_email"
    );
    const otherRows = samePathRows.filter((entry) => !requestIds.includes(Number(entry.id)));
    if (otherRows.length) {
      pathRefs.push({ requestId: row.id, objectPath: path, sharedWith: otherRows });
    }
  }
  references.storage_path_cross_refs = {
    table: "subscription_requests.payment_proof_path",
    referenceType: "shared_storage_path",
    fkEnforced: false,
    rowIds: pathRefs.map((entry) => entry.objectPath),
    rowCount: pathRefs.length,
    rows: pathRefs,
    cleanupAction: pathRefs.length ? "blocker" : "none",
  };

  return references;
}

async function buildCommissionPlans(supabase, references) {
  const commissions = references.partner_commissions?.rows || [];
  const partnerIds = [...new Set(commissions.map((row) => row.partner_id).filter(Boolean))];
  const partnersById = new Map();
  if (partnerIds.length) {
    const { data, error } = await supabase
      .from("partners")
      .select("id,balance_withdrawable,balance_pending,total_earnings,total_withdrawn")
      .in("id", partnerIds);
    if (error) throw error;
    for (const partner of data || []) partnersById.set(partner.id, partner);
  }

  const withdrawalsByPartner = new Map();
  for (const row of references.partner_withdrawals?.rows || []) {
    const list = withdrawalsByPartner.get(row.partner_id) || [];
    list.push(row);
    withdrawalsByPartner.set(row.partner_id, list);
  }

  const plans = [];
  const blockers = [];
  for (const commission of commissions) {
    const partner = partnersById.get(commission.partner_id) || {};
    const requestId = Number(commission.subscription_id || commission.source_ref);
    let settlementAssessment = null;
    if (Number.isFinite(requestId)) {
      settlementAssessment = await assessSettlementStateForRequest(supabase, requestId);
    }

    const settlementPreview = previewCommissionCleanupEligibility(
      commission,
      partner,
      settlementAssessment
    );
    const preview = settlementPreview || previewCommissionReversal(commission, partner);
    plans.push(preview);
    blockers.push(
      ...evaluateWithdrawalBlockers({
        partner,
        commissionPreview: preview,
        withdrawals: withdrawalsByPartner.get(commission.partner_id) || [],
      }).map((entry) => ({ ...entry, commissionId: commission.id, partnerId: commission.partner_id }))
    );
    if (preview.blocker) {
      blockers.push({
        code: preview.blocker,
        commissionId: commission.id,
        requestId: commission.subscription_id || commission.source_ref,
      });
    }
  }

  return { commissionPlans: plans, commissionBlockers: blockers };
}

async function buildStorageTargets(supabase, requestIds, rowsById, references) {
  const sessionsByRequest = new Map();
  for (const session of references.subscription_upload_sessions?.rows || []) {
    const list = sessionsByRequest.get(Number(session.subscription_request_id)) || [];
    list.push(String(session.object_path || "").trim());
    sessionsByRequest.set(Number(session.subscription_request_id), list);
  }

  const crossRefBlocked = new Map();
  for (const entry of references.storage_path_cross_refs?.rows || []) {
    crossRefBlocked.set(entry.objectPath, entry);
  }

  const targets = [];
  for (const requestId of requestIds) {
    const row = rowsById[requestId];
    if (!row) continue;
    const dbPath = String(row.payment_proof_path || "").trim();
    if (!dbPath) continue;

    const inspection = await inspectStorageObject(supabase, dbPath);
    const target = buildStorageTarget({
      requestId,
      rowPath: dbPath,
      storageInspection: inspection,
      uploadSessionPaths: sessionsByRequest.get(requestId) || [],
    });

    if (crossRefBlocked.has(dbPath)) {
      target.blocked = true;
      target.blocker = "STORAGE_PATH_REFERENCED_BY_OTHER_REQUEST";
      target.sharedWith = crossRefBlocked.get(dbPath).sharedWith;
    }

    targets.push(target);
  }

  return targets;
}

export async function executeTestPaymentProofCleanup(supabase, plan) {
  assertExecuteAllowed(plan);
  const requestIds = plan.requestIds;
  const refs = plan.references;

  for (const commission of refs.partner_commissions?.rows || []) {
    if (commission.status !== "rejected") {
      await reverseTestCommissionForCleanup(supabase, commission.id);
    }
  }

  if (refs.partner_wallet_ledger?.rowIds?.length) {
    await supabase.from("partner_wallet_ledger").delete().in("id", refs.partner_wallet_ledger.rowIds);
  }
  if (refs.partner_commissions?.rowIds?.length) {
    await supabase.from("partner_commissions").delete().in("id", refs.partner_commissions.rowIds);
  }
  if (refs.subscription_upload_sessions?.rowIds?.length) {
    await supabase
      .from("subscription_upload_sessions")
      .delete()
      .in("id", refs.subscription_upload_sessions.rowIds);
  }
  if (refs.admin_user_notes?.rowIds?.length) {
    await supabase.from("admin_user_notes").delete().in("id", refs.admin_user_notes.rowIds);
  }
  if (refs.notifications?.rowIds?.length) {
    await supabase.from("notifications").delete().in("id", refs.notifications.rowIds);
  }
  if (refs.email_outbox?.rowIds?.length) {
    await supabase.from("email_outbox").delete().in("id", refs.email_outbox.rowIds);
  }
  if (refs.admin_logs?.rowIds?.length) {
    await supabase.from("admin_logs").delete().in("id", refs.admin_logs.rowIds);
  }
  if (refs.partner_referrals?.rowIds?.length) {
    await supabase.from("partner_referrals").delete().in("id", refs.partner_referrals.rowIds);
  }

  await supabase
    .from("subscription_requests")
    .update({
      payment_proof: null,
      payment_proof_path: null,
      payment_proof_mime_type: null,
      payment_proof_size_bytes: null,
      payment_proof_uploaded_at: null,
      payment_proof_storage_provider: null,
    })
    .in("id", requestIds);

  await supabase.from("subscription_requests").delete().in("id", requestIds);

  for (const target of plan.storageTargets || []) {
    if (!target.objectPath || target.blocked) continue;
    const { data: remainingRefs, error: refError } = await supabase
      .from("subscription_requests")
      .select("id")
      .eq("payment_proof_path", target.objectPath)
      .limit(1);
    if (refError) throw refError;
    const { data: remainingSessions, error: sessionError } = await supabase
      .from("subscription_upload_sessions")
      .select("id")
      .eq("object_path", target.objectPath)
      .limit(1);
    if (sessionError) throw sessionError;
    if ((remainingRefs || []).length || (remainingSessions || []).length) {
      throw new Error(`Storage path still referenced after DB cleanup: ${target.objectPath}`);
    }
    await supabase.storage.from(PAYMENT_PROOF_BUCKET).remove([target.objectPath]);
  }

  return { ok: true, deletedRequestIds: requestIds };
}

export async function runCleanupTestPaymentProofData({
  supabase,
  argv = [],
  executeImpl = executeTestPaymentProofCleanup,
} = {}) {
  const args = parseCleanupArgs(argv);
  const requestIds = assertExplicitRequestIds(args.requestIds);

  const { data: rows, error } = await supabase
    .from("subscription_requests")
    .select(
      "id,user_email,username,status,plan_name,category,price,started_at,expires_at,admin_disabled,payment_proof,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes,created_at"
    )
    .in("id", requestIds)
    .order("id");
  if (error) throw error;

  const rowsById = Object.fromEntries((rows || []).map((row) => [Number(row.id), row]));
  const references = await discoverTestPaymentProofReferences(supabase, requestIds, rowsById);
  const { commissionPlans, commissionBlockers } = await buildCommissionPlans(supabase, references);
  const storageTargets = await buildStorageTargets(supabase, requestIds, rowsById, references);

  if ((references.storage_path_cross_refs?.rowCount || 0) > 0) {
    commissionBlockers.push({
      code: "STORAGE_PATH_REFERENCED_BY_OTHER_REQUEST",
      rows: references.storage_path_cross_refs.rows,
    });
  }

  const plan = buildCleanupPlan({
    requestIds,
    rows: rows || [],
    references,
    commissionPlans,
    storageTargets,
    blockers: commissionBlockers,
    dryRun: args.dryRun,
  });

  plan.knownReferenceSpecs = KNOWN_REFERENCE_SPECS;
  plan.partnerBalanceSummary = summarizePartnerBalances(commissionPlans);

  if (!args.dryRun) {
    plan.executeResult = await executeImpl(supabase, plan);
  }

  return plan;
}
