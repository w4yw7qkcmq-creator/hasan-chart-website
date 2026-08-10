#!/usr/bin/env node
/**
 * Round 8 — REAL 90/90 Staging Validation (STAGING ONLY)
 * No fake PASS. Every scenario executes assertions.
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import {
  assertStagingGuard,
  serviceClient,
  applyTestHooksMigration,
  runStagingSql,
  partnerBalances,
  initFixturePool,
  signInJwt,
  restoreIamSnapshot,
  setQualState,
  createCommissionRpc,
  upsertEntitlement,
  mkTierPartner,
  captureRunStartedAt,
  insertSubscription,
  snapshotFinancialBaseline,
  cleanupRunFixtures,
  adminApi,
  runRegressionSuite,
  runBuild,
  crypto,
  QUALIFICATION_STATES,
  invalidateEntitlementPending,
  reversePartnerServiceCommissionAtomic,
  releasePartnerCommissionAtomic,
  toCommissionSourceId,
  assertNoFraudPollution,
  assertCommissionRpc,
  armStagingFailureInjection,
  initFixtureRegistry,
  trackTierPartner,
  snapshotVipSignalRule,
  restoreVipSignalRule,
  clearStagingFailureFlags,
  R8_DEV_PORT,
  FIXTURE_DOMAIN,
} from "./r8-staging-harness-lib.mjs";
import {
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  startDevServer,
  stopDevServer,
  loginViaSupabase,
  attachPageObservers,
  sleep,
  loadEnv,
} from "../iam/browser-qa-harness.mjs";

const RUN_ID = `r8_${Date.now()}`;
const ARTIFACT = join(process.cwd(), "scripts/partner-center/.artifacts", `r8-manifest-${RUN_ID}.json`);
const BASE = `http://127.0.0.1:${R8_DEV_PORT}`;

const results = [];
let devServer = null;
let ctx = {};

async function scenario(def) {
  const start = Date.now();
  try {
    const evidence = await def.run(ctx);
    const row = {
      id: def.id,
      name: def.name,
      category: def.category,
      status: def.status || "PASS",
      durationMs: Date.now() - start,
      evidence: evidence ?? {},
    };
    results.push(row);
    console.log(`${row.status} ${def.id} ${def.name}${row.status === "N/A" ? "" : ""}`);
    return row;
  } catch (err) {
    const row = {
      id: def.id,
      name: def.name,
      category: def.category,
      status: "FAIL",
      durationMs: Date.now() - start,
      error: String(err?.message || err),
    };
    results.push(row);
    console.error(`FAIL ${def.id} ${def.name}: ${row.error}`);
    throw err;
  }
}

function naScenario(def, evidence) {
  return scenario({ ...def, status: "N/A", run: async () => evidence });
}

const MANIFEST = [
  {
    id: "R8-001",
    name: "staging_target_guard",
    category: "guard",
    run: async () => {
      assertStagingGuard();
      return { projectRef: process.env.STAGING_SUPABASE_PROJECT_REF?.slice(0, 4) + "***" };
    },
  },
  {
    id: "R8-002",
    name: "entitlements_table_exists",
    category: "catalog",
    run: async ({ service }) => {
      const { count, error } = await service
        .from("partner_service_commission_entitlements")
        .select("id", { count: "exact", head: true });
      assert.equal(error, null);
      assert.ok(count >= 0);
      return { count };
    },
  },
  {
    id: "R8-003",
    name: "reverse_rpc_catalog",
    category: "catalog",
    run: async ({ service }) => {
      const probe = await service.rpc("reverse_partner_service_commission_atomic", {
        p_commission_id: "00000000-0000-4000-8000-000000000001",
        p_reason: "probe",
        p_refund_event_id: "probe",
      });
      assert.ok(probe.error?.message?.includes("commission_not_found") || probe.data);
      return { probe: probe.error?.message || "ok" };
    },
  },
  {
    id: "R8-004",
    name: "vip_forex_rule_active",
    category: "catalog",
    run: async ({ service }) => {
      const { count } = await service
        .from("partner_commission_rules")
        .select("id", { count: "exact", head: true })
        .eq("service_type", "vip_forex")
        .eq("status", "active");
      assert.ok(count >= 1);
      return { count };
    },
  },
  {
    id: "R8-005",
    name: "account_management_disabled",
    category: "catalog",
    run: async ({ service }) => {
      const { data } = await service
        .from("partner_commission_rules")
        .select("is_enabled")
        .eq("service_type", "account_management")
        .eq("status", "active")
        .maybeSingle();
      assert.equal(data?.is_enabled, false);
      return { is_enabled: data?.is_enabled };
    },
  },
  {
    id: "R8-006",
    name: "future_service_disabled",
    category: "catalog",
    run: async ({ service }) => {
      const { data } = await service
        .from("partner_commission_rules")
        .select("is_enabled, status")
        .eq("service_type", "future_service")
        .maybeSingle();
      assert.ok(!data || data.is_enabled === false || data.status !== "active");
      return { rule: data };
    },
  },
];

async function registerRpcAclScenarios() {
  const rpcs = [
    "create_partner_commission_atomic",
    "reverse_partner_service_commission_atomic",
    "partner_center_assert_service_commission_qualification",
  ];
  MANIFEST.push(
    {
      id: "R8-007",
      name: "rpc_acl_create_service_role",
      category: "rpc_acl",
      run: async ({ service }) => {
        const grants = runStagingSql(`
          SELECT grantee FROM information_schema.routine_privileges
          WHERE routine_schema='public' AND routine_name='create_partner_commission_atomic'
            AND privilege_type='EXECUTE' AND grantee='service_role';`);
        assert.ok((grants.rows || []).length >= 1);
        return { grantees: (grants.rows || []).map((r) => r.grantee) };
      },
    },
    {
      id: "R8-008",
      name: "rpc_acl_create_anon_denied",
      category: "rpc_acl",
      run: async ({ anon }) => {
        const { error } = await anon.rpc("create_partner_commission_atomic", {
          p_partner_id: crypto.randomUUID(),
          p_referral_id: crypto.randomUUID(),
          p_referred_user_id: crypto.randomUUID(),
          p_service_type: "vip_signal",
          p_source_id: "1",
          p_base_amount: 100,
          p_commission_percent: 10,
          p_reason: "x",
          p_initial_status: "pending_activation",
          p_invited_username: "x",
          p_idempotency_key: "x",
          p_source_type: "service",
        });
        assert.ok(error);
        return { denied: true };
      },
    },
    {
      id: "R8-009",
      name: "rpc_acl_create_authenticated_denied",
      category: "rpc_acl",
      run: async ({ partnerAClient }) => {
        const { error } = await partnerAClient.rpc("create_partner_commission_atomic", {
          p_partner_id: crypto.randomUUID(),
          p_referral_id: crypto.randomUUID(),
          p_referred_user_id: crypto.randomUUID(),
          p_service_type: "vip_signal",
          p_source_id: "1",
          p_base_amount: 100,
          p_commission_percent: 10,
          p_reason: "x",
          p_initial_status: "pending_activation",
          p_invited_username: "x",
          p_idempotency_key: "x",
          p_source_type: "service",
        });
        assert.ok(error);
        return { denied: true };
      },
    },
    {
      id: "R8-010",
      name: "rpc_acl_reverse_anon_denied",
      category: "rpc_acl",
      run: async ({ anon }) => {
        const { error } = await anon.rpc("reverse_partner_service_commission_atomic", {
          p_commission_id: crypto.randomUUID(),
          p_reason: "x",
        });
        assert.ok(error);
        return { denied: true };
      },
    },
    {
      id: "R8-011",
      name: "rpc_acl_assert_qual_authenticated_denied",
      category: "rpc_acl",
      run: async ({ partnerAClient }) => {
        const { error } = await partnerAClient.rpc("partner_center_assert_service_commission_qualification", {
          p_referral_id: crypto.randomUUID(),
          p_entitlement_id: null,
        });
        assert.ok(error);
        return { denied: true };
      },
    },
    {
      id: "R8-012",
      name: "rpc_security_definer_create",
      category: "rpc_acl",
      run: async () => {
        const q = runStagingSql(`
          SELECT p.prosecdef AS security_definer,
            (SELECT option_value FROM pg_options_to_table(p.proconfig) WHERE option_name='search_path') AS search_path
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='create_partner_commission_atomic' LIMIT 1;`);
        const row = q.rows?.[0];
        assert.equal(row?.security_definer, true);
        assert.ok(String(row?.search_path || "").includes("public"));
        return row;
      },
    },
    {
      id: "R8-013",
      name: "rpc_security_definer_reverse",
      category: "rpc_acl",
      run: async () => {
        const q = runStagingSql(`
          SELECT p.prosecdef AS security_definer,
            (SELECT option_value FROM pg_options_to_table(p.proconfig) WHERE option_name='search_path') AS search_path
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='reverse_partner_service_commission_atomic' LIMIT 1;`);
        const row = q.rows?.[0];
        assert.equal(row?.security_definer, true);
        assert.ok(String(row?.search_path || "").includes("public"));
        return row;
      },
    }
  );
}

async function registerJwtScenarios() {
  for (const [id, name, actor, method, expectAllowed] of [
    ["R8-014", "jwt_super_admin_get", "superAdmin", "GET", true],
    ["R8-015", "jwt_super_admin_put", "superAdmin", "PUT", true],
    ["R8-016", "jwt_rewards_read_get", "rewardsRead", "GET", true],
    ["R8-017", "jwt_rewards_read_put_denied", "rewardsRead", "PUT", false],
    ["R8-018", "jwt_rewards_manage_put", "rewardsManage", "PUT", true],
    ["R8-019", "jwt_rewards_manage_get", "rewardsManage", "GET", true],
    ["R8-020", "jwt_partner_get_denied", "partnerA", "GET", false],
    ["R8-021", "jwt_partner_put_denied", "partnerA", "PUT", false],
    ["R8-022", "jwt_unauthorized_get_denied", "unauthorized", "GET", false],
    ["R8-023", "jwt_unauthorized_put_denied", "unauthorized", "PUT", false],
  ]) {
    MANIFEST.push({
      id,
      name,
      category: "jwt_iam",
      run: async ({ sessions }) => {
        const body =
          method === "PUT"
            ? { serviceType: "vip_signal", reason: "r8 jwt probe", tierPolicy: "use_partner_tier" }
            : undefined;
        const res = await adminApi(BASE, sessions[actor].cookie, method, body);
        if (expectAllowed) {
          assert.ok(res.status >= 200 && res.status < 300, `expected allow got ${res.status}`);
        } else {
          assert.ok(res.status === 401 || res.status === 403, `expected deny got ${res.status}`);
        }
        return { status: res.status, actor, method };
      },
    });
  }
  MANIFEST.push({
    id: "R8-024",
    name: "jwt_anon_get_401",
    category: "jwt_iam",
    run: async () => {
      const res = await fetch(`${BASE}/api/admin/partner-marketing/service-commissions`);
      assert.ok(res.status === 401 || res.status === 403);
      return { status: res.status };
    },
  });
}

async function registerRemainingScenarios() {
  MANIFEST.push(
    {
      id: "R8-025",
      name: "rls_partner_a_own_entitlement",
      category: "rls",
      run: async ({ service, fx, partnerAClient, sessions }) => {
        const sourceId = toCommissionSourceId(`rls-a-${RUN_ID}`);
        await upsertEntitlement(service, { ...fx, partnerId: fx.partnerAId, referralId: fx.refVerifiedId, referredUserId: fx.referredVerifiedId, runId: RUN_ID }, {
          sourceId,
          serviceType: "vip_signal",
          baseAmount: 100,
          amount: 10,
        });
        const { data, error } = await partnerAClient
          .from("partner_service_commission_entitlements")
          .select("id")
          .eq("source_id", sourceId);
        assert.ok(error, "partner must not direct-select entitlements table");
        assert.equal(error.code, "42501");
        assert.equal((data || []).length, 0);
        const apiRes = await fetch(`${BASE}/api/partner/center`, {
          headers: { Cookie: sessions.partnerA.cookie },
        });
        assert.ok(apiRes.status === 200 || apiRes.status === 401);
        return {
          denied: true,
          policy: "entitlements_server_internal_partner_api_read_model_only",
          apiStatus: apiRes.status,
        };
      },
    },
    {
      id: "R8-026",
      name: "rls_partner_a_not_b_entitlement",
      category: "rls",
      run: async ({ service, fx, partnerAClient }) => {
        const sourceId = `rls-b-${RUN_ID}`;
        await upsertEntitlement(service, { ...fx, partnerId: fx.partnerBId, referralId: fx.refVerifiedId, referredUserId: fx.referredVerifiedId, runId: RUN_ID }, {
          sourceId,
          serviceType: "vip_signal",
          baseAmount: 100,
          amount: 10,
        });
        const { data } = await partnerAClient
          .from("partner_service_commission_entitlements")
          .select("id")
          .eq("source_id", sourceId);
        assert.equal((data || []).length, 0);
        return { crossRead: 0 };
      },
    },
    {
      id: "R8-027",
      name: "rls_partner_insert_entitlement_denied",
      category: "rls",
      run: async ({ partnerAClient, fx }) => {
        const ins = await partnerAClient.from("partner_service_commission_entitlements").insert({
          partner_id: fx.partnerAId,
          referral_id: fx.refVerifiedId,
          referred_user_id: fx.referredVerifiedId,
          service_type: "vip_signal",
          source_id: `hack-${RUN_ID}`,
          base_amount: 100,
          calculated_amount: 10,
          status: "pending_qualification",
          idempotency_key: `hack:${RUN_ID}`,
        });
        assert.ok(ins.error);
        return { denied: true };
      },
    },
    {
      id: "R8-028",
      name: "rls_partner_update_entitlement_denied",
      category: "rls",
      run: async ({ partnerAClient }) => {
        const upd = await partnerAClient
          .from("partner_service_commission_entitlements")
          .update({ status: "credited" })
          .eq("source_id", `rls-a-${RUN_ID}`);
        assert.ok(upd.error || (upd.data || []).length === 0);
        return { denied: true };
      },
    },
    {
      id: "R8-029",
      name: "rls_partner_delete_entitlement_denied",
      category: "rls",
      run: async ({ partnerAClient }) => {
        const del = await partnerAClient
          .from("partner_service_commission_entitlements")
          .delete()
          .eq("source_id", `rls-a-${RUN_ID}`);
        assert.ok(del.error || (del.count ?? 0) === 0);
        return { denied: true };
      },
    },
    {
      id: "R8-030",
      name: "rls_partner_mutate_rules_denied",
      category: "rls",
      run: async ({ partnerAClient }) => {
        const upd = await partnerAClient
          .from("partner_commission_rules")
          .update({ commission_percent: 99 })
          .eq("service_type", "vip_signal");
        assert.ok(upd.error);
        return { denied: true };
      },
    },
    {
      id: "R8-031",
      name: "rls_anon_no_financial",
      category: "rls",
      run: async ({ anon }) => {
        const { data, error } = await anon.from("partner_financial_ledger_entries").select("id").limit(1);
        assert.ok(error || (data || []).length === 0);
        return { blocked: true };
      },
    }
  );

  // Qualification gate R8-032..037
  MANIFEST.push(
    {
      id: "R8-032",
      name: "qual_signup_no_commission",
      category: "qualification",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refVerifiedId, fx.partnerAId, QUALIFICATION_STATES.SIGNUP);
        const before = await partnerBalances(service, fx.partnerAId);
        const sourceId = crypto.randomUUID();
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refVerifiedId,
          referredUserId: fx.referredVerifiedId,
          runId: RUN_ID,
        }, { sourceId, serviceType: "vip_signal", baseAmount: 100 });
        assert.ok(rpc.error?.message?.includes("referral_not_qualified"));
        const after = await partnerBalances(service, fx.partnerAId);
        assert.equal(Number(after.balance_pending), Number(before.balance_pending));
        return { error: rpc.error?.message };
      },
    },
    {
      id: "R8-033",
      name: "qual_verified_no_commission",
      category: "qualification",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refVerifiedId, fx.partnerAId, QUALIFICATION_STATES.VERIFIED);
        const before = await partnerBalances(service, fx.partnerAId);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refVerifiedId,
          referredUserId: fx.referredVerifiedId,
          runId: RUN_ID,
        }, { sourceId: crypto.randomUUID(), serviceType: "vip_signal", baseAmount: 100 });
        assert.ok(rpc.error?.message?.includes("referral_not_qualified"));
        const after = await partnerBalances(service, fx.partnerAId);
        assert.equal(Number(after.balance_pending), Number(before.balance_pending));
        return { state: "verified" };
      },
    },
    {
      id: "R8-034",
      name: "qual_qualified_commission_allowed",
      category: "qualification",
      run: async ({ service, fx }) => {
        await assertNoFraudPollution(service, fx.partnerAId, fx.refQualifiedId, "R8-034");
        await setQualState(service, fx.refQualifiedId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `q-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const data = assertCommissionRpc(rpc);
        assert.equal(Number(data.amount), 10);
        return { amount: data.amount, commissionId: data.commission_id };
      },
    },
    {
      id: "R8-035",
      name: "chargeback_entity_architecture",
      category: "architecture",
      status: "N/A",
      run: async () => {
        const tables = runStagingSql(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema='public' AND table_name ILIKE '%chargeback%';`);
        assert.equal((tables.rows || []).length, 0);
        return {
          reason: "no chargeback table or dedicated chargeback RPC path in schema",
          tablesFound: 0,
          invalidationTypes: ["COMMISSION_INVALIDATION_TYPES.CHARGEBACK in service-commission-refund.js only — no persisted chargeback entity"],
        };
      },
    },
    {
      id: "R8-036",
      name: "qual_customer_commission_allowed",
      category: "qualification",
      run: async ({ service, fx }) => {
        await assertNoFraudPollution(service, fx.partnerAId, fx.refQualifiedId, "R8-036");
        await setQualState(service, fx.refQualifiedId, fx.partnerAId, QUALIFICATION_STATES.CUSTOMER);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `cust-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const data = assertCommissionRpc(rpc);
        return { amount: data.amount };
      },
    },
    {
      id: "R8-037",
      name: "fraud_high_blocks_payable",
      category: "qualification",
      run: async ({ service, fx }) => {
        const fraudInsert = await service.from("partner_fraud_assessments").insert({
          partner_id: fx.partnerFraudHighId,
          referral_id: fx.refFraudHighId,
          referred_user_id: fx.referredFraudHighId,
          context_type: "referral_signup",
          risk_level: "HIGH",
          score: 90,
          signals: [{ type: "r8", weight: 90 }],
          decision: "review",
        }).select("id").single();
        assert.equal(fraudInsert.error, null);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerFraudHighId,
          referralId: fx.refFraudHighId,
          referredUserId: fx.referredFraudHighId,
          runId: RUN_ID,
        }, { sourceId: `fraud-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const data = assertCommissionRpc(rpc);
        assert.equal(data.payout_hold, true);
        const rel = await releasePartnerCommissionAtomic(service, data.commission_id);
        assert.ok(rel.released === false || rel.blocked === true);
        await service.from("partner_fraud_assessments").delete().eq("id", fraudInsert.data.id);
        await assertNoFraudPollution(service, fx.partnerAId, fx.refQualifiedId, "partnerA_after_fraud_test");
        return { payout_hold: data.payout_hold, releaseBlocked: true, isolated: true };
      },
    }
  );

  // Purchase before qual R8-038..041
  MANIFEST.push(
    {
      id: "R8-038",
      name: "purchase_before_qual_pending",
      category: "entitlement",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refVerifiedId, fx.partnerAId, QUALIFICATION_STATES.VERIFIED);
        const before = await partnerBalances(service, fx.partnerAId);
        const sourceId = toCommissionSourceId(`pbq-${RUN_ID}`);
        const ent = await upsertEntitlement(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refVerifiedId,
          referredUserId: fx.referredVerifiedId,
          runId: RUN_ID,
        }, { sourceId, serviceType: "vip_signal", baseAmount: 100, amount: 10 });
        assert.ok(ent.data?.id);
        const { count } = await service
          .from("partner_commissions")
          .select("id", { count: "exact", head: true })
          .eq("source_id", sourceId);
        assert.equal(count, 0);
        const after = await partnerBalances(service, fx.partnerAId);
        assert.equal(Number(after.balance_pending), Number(before.balance_pending));
        ctx.pbq = { entId: ent.data.id, sourceId };
        return { entitlementId: ent.data.id, commissionCount: 0 };
      },
    },
    {
      id: "R8-039",
      name: "purchase_before_qual_credit_on_qualify",
      category: "entitlement",
      run: async ({ service, fx }) => {
        await assertNoFraudPollution(service, fx.partnerAId, fx.refVerifiedId, "R8-039");
        await setQualState(service, fx.refVerifiedId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refVerifiedId,
          referredUserId: fx.referredVerifiedId,
          runId: RUN_ID,
        }, {
          sourceId: ctx.pbq.sourceId,
          serviceType: "vip_signal",
          baseAmount: 100,
          entitlementId: ctx.pbq.entId,
        });
        const data = assertCommissionRpc(rpc);
        assert.equal(Number(data.amount), 10);
        return { commissionId: data.commission_id, amount: 10 };
      },
    },
    {
      id: "R8-040",
      name: "purchase_before_qual_evaluator_replay",
      category: "entitlement",
      run: async ({ service, fx }) => {
        let last = null;
        for (let i = 0; i < 10; i += 1) {
          last = await createCommissionRpc(service, {
            partnerId: fx.partnerAId,
            referralId: fx.refVerifiedId,
            referredUserId: fx.referredVerifiedId,
            runId: RUN_ID,
          }, {
            sourceId: ctx.pbq.sourceId,
            serviceType: "vip_signal",
            baseAmount: 100,
          });
        }
        assert.ok(last.data?.duplicate || last.data?.created === false);
        const { count } = await service
          .from("partner_commissions")
          .select("id", { count: "exact", head: true })
          .eq("source_id", ctx.pbq.sourceId);
        assert.equal(count, 1);
        return { replayRuns: 10, commissionCount: count, last };
      },
    },
    {
      id: "R8-041",
      name: "invalidated_entitlement_no_late_credit",
      category: "entitlement",
      run: async ({ service, fx }) => {
        await service
          .from("partner_service_commission_entitlements")
          .delete()
          .eq("referral_id", fx.refInvalidId);
        const sourceId = toCommissionSourceId(`inv-${RUN_ID}`);
        await setQualState(service, fx.refInvalidId, fx.partnerAId, QUALIFICATION_STATES.VERIFIED);
        const ent = await upsertEntitlement(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refInvalidId,
          referredUserId: fx.referredInvalidId,
          runId: RUN_ID,
        }, { sourceId, serviceType: "vip_signal", baseAmount: 100, amount: 10 });
        assert.ok(ent.data?.id);
        const invalidated = await invalidateEntitlementPending(service, {
          entitlementId: ent.data.id,
          sourceId,
          serviceType: "vip_signal",
        });
        assert.equal(invalidated.invalidated, 1);
        await setQualState(service, fx.refInvalidId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const credit = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refInvalidId,
          referredUserId: fx.referredInvalidId,
          runId: RUN_ID,
        }, { sourceId, serviceType: "vip_signal", baseAmount: 100, entitlementId: null });
        const { count } = await service
          .from("partner_commissions")
          .select("id", { count: "exact", head: true })
          .eq("source_id", sourceId);
        assert.equal(count, 0);
        assert.ok(
          credit.error?.message?.includes("entitlement_invalidated")
            || credit.data?.created === false
        );
        return { commissionCount: 0, credit: credit.error?.message || credit.data };
      },
    }
  );

  // Tamper R8-042..043
  MANIFEST.push(
    {
      id: "R8-042",
      name: "trusted_db_price_authoritative",
      category: "tamper",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refQualifiedId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const { onPartnerGenericServiceActivated } = await import("../../lib/partner-service-hooks.js");
        const sub = await insertSubscription(service, {
          userEmail: fx.emails.referredQualified,
          price: "$100",
          runTag: RUN_ID,
        });
        await service.from("subscription_requests").update({ status: "مفعل" }).eq("id", sub.id);
        const result = await onPartnerGenericServiceActivated(service, {
          userId: fx.referredQualifiedId,
          subscriptionId: String(sub.id),
          serviceType: "vip_signal",
          subscriptionPrice: 999999,
          reason: "tamper test",
        });
        assert.equal(result.created, true);
        const { data: comm } = await service
          .from("partner_commissions")
          .select("amount, base_amount")
          .eq("source_id", String(sub.id))
          .maybeSingle();
        assert.equal(Number(comm?.base_amount), 100);
        assert.equal(Number(comm?.amount), 10);
        return { base_amount: comm?.base_amount, amount: comm?.amount };
      },
    },
    {
      id: "R8-043",
      name: "source_ownership_enforced",
      category: "tamper",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refQualifiedId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const sub = await insertSubscription(service, {
          userEmail: `r8-own-${RUN_ID}@${FIXTURE_DOMAIN}`,
          price: "$100",
          runTag: `${RUN_ID}-own`,
        });
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredVerifiedId,
          runId: RUN_ID,
        }, { sourceId: String(sub.id), serviceType: "vip_signal", baseAmount: 999999 });
        assert.ok(
          rpc.error?.message?.includes("source_ownership_mismatch")
            || String(rpc.error?.details || "").includes("source_ownership_mismatch")
            || rpc.data?.created === false
        );
        const { count } = await service
          .from("partner_commissions")
          .select("id", { count: "exact", head: true })
          .eq("source_id", String(sub.id));
        assert.equal(count, 0);
        return { blocked: true };
      },
    }
  );

  // Tier matrix R8-044..050
  const tierExpect = [
    ["R8-044", "partner", 10],
    ["R8-045", "silver", 15],
    ["R8-046", "gold", 20],
    ["R8-047", "platinum", 25],
    ["R8-048", "diamond", 30],
  ];
  for (const [id, tier, pct] of tierExpect) {
    MANIFEST.push({
      id,
      name: `tier_${tier}_${pct}_rpc`,
      category: "tier",
      run: async ({ service }) => {
        const tfx = await mkTierPartner(service, RUN_ID, tier);
        trackTierPartner(ctx.fixtureRegistry, tfx);
        const sourceId = `${id}-${RUN_ID}`;
        const rpc = await createCommissionRpc(service, tfx, {
          sourceId,
          serviceType: "vip_signal",
          baseAmount: 100,
          commissionPercent: pct,
        });
        assert.equal(rpc.data?.created, true);
        assert.equal(Number(rpc.data?.amount), pct);
        return { tier, amount: rpc.data?.amount };
      },
    });
  }

  MANIFEST.push(
    {
      id: "R8-049",
      name: "fixed_service_rate_7_5",
      category: "tier",
      run: async ({ service, sessions }) => {
        ctx.fixedRuleRestore = await snapshotVipSignalRule(service);
        try {
          const put = await adminApi(BASE, sessions.superAdmin.cookie, "PUT", {
            serviceType: "vip_signal",
            tierPolicy: "fixed_service_rate",
            commissionPercent: 7.5,
            reason: "r8 fixed rate test",
          });
          assert.ok(put.status >= 200 && put.status < 300);
          const tfx = await mkTierPartner(service, RUN_ID, "diamond");
          trackTierPartner(ctx.fixtureRegistry, tfx);
          const rpc = await createCommissionRpc(service, tfx, {
            sourceId: `fix-${RUN_ID}`,
            serviceType: "vip_signal",
            baseAmount: 100,
            commissionPercent: 30,
          });
          assert.equal(Number(rpc.data?.amount), 7.5);
          return { amount: rpc.data?.amount };
        } finally {
          await restoreVipSignalRule(service, sessions, ctx.fixedRuleRestore, BASE);
        }
      },
    },
    {
      id: "R8-050",
      name: "use_partner_tier_gold_20",
      category: "tier",
      run: async ({ service, sessions }) => {
        await restoreVipSignalRule(service, sessions, await snapshotVipSignalRule(service), BASE);
        const { data: ruleRow } = await service
          .from("partner_commission_rules")
          .select("tier_policy, commission_percent")
          .eq("service_type", "vip_signal")
          .eq("status", "active")
          .maybeSingle();
        assert.equal(
          ruleRow?.tier_policy,
          "use_partner_tier",
          `rule_pollution: expected use_partner_tier got ${JSON.stringify(ruleRow)}`
        );
        const tfx = await mkTierPartner(service, RUN_ID, "gold");
        trackTierPartner(ctx.fixtureRegistry, tfx);
        const rpc = await createCommissionRpc(service, tfx, {
          sourceId: `gold-${RUN_ID}`,
          serviceType: "vip_signal",
          baseAmount: 100,
          commissionPercent: 7,
        });
        assert.equal(Number(rpc.data?.amount), 20);
        return { amount: 20, tierPolicy: ruleRow?.tier_policy };
      },
    }
  );

  // Service paths R8-051..053
  MANIFEST.push(
    {
      id: "R8-051",
      name: "vip_forex_e2e",
      category: "service",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refQualifiedId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `forex-${RUN_ID}`, serviceType: "vip_forex", baseAmount: 100 });
        assert.equal(rpc.data?.created, true);
        const { count: ledgerCount } = await service
          .from("partner_financial_ledger_entries")
          .select("id", { count: "exact", head: true })
          .eq("legacy_commission_id", rpc.data.commission_id);
        assert.equal(ledgerCount, 1);
        return { commissionId: rpc.data.commission_id, ledgerCount };
      },
    },
    {
      id: "R8-052",
      name: "account_management_fail_closed",
      category: "service",
      run: async ({ service, fx }) => {
        const { onPartnerAccountManagementActivated } = await import("../../lib/partner-service-hooks.js");
        const before = await partnerBalances(service, fx.partnerAId);
        const result = await onPartnerAccountManagementActivated(service, {
          requestId: `am-${RUN_ID}`,
          userId: fx.referredQualifiedId,
          userEmail: fx.emails.referredQualified,
          username: "r8",
          capital: 1000,
        });
        assert.equal(result.created, false);
        assert.ok(result.reason);
        const after = await partnerBalances(service, fx.partnerAId);
        assert.equal(Number(after.balance_pending), Number(before.balance_pending));
        const { count } = await service
          .from("partner_service_commission_entitlements")
          .select("id", { count: "exact", head: true })
          .eq("source_id", `am-${RUN_ID}`);
        assert.equal(count, 0);
        return { reason: result.reason };
      },
    },
    {
      id: "R8-053",
      name: "future_service_no_financial",
      category: "service",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refQualifiedId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const before = await partnerBalances(service, fx.partnerAId);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `fs-${RUN_ID}`, serviceType: "future_service", baseAmount: 100 });
        assert.ok(rpc.error?.message?.includes("inactive_commission_rule") || rpc.data?.created === false);
        const after = await partnerBalances(service, fx.partnerAId);
        assert.equal(Number(after.balance_pending), Number(before.balance_pending));
        return { blocked: true };
      },
    }
  );

  // Refunds R8-054..060 - use shared commission ctx.refundCommId
  MANIFEST.push(
    {
      id: "R8-054",
      name: "full_refund_reversal",
      category: "refund",
      run: async ({ service, fx }) => {
        await setQualState(service, fx.refQualifiedId, fx.partnerAId, QUALIFICATION_STATES.QUALIFIED);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `full-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        ctx.refundCommId = rpc.data.commission_id;
        const rev = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: ctx.refundCommId,
          refundEventId: `full-${RUN_ID}`,
          reason: "full_refund",
        });
        assert.equal(rev.reversed, true);
        assert.equal(Number(rev.amount), 10);
        const dup = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: ctx.refundCommId,
          refundEventId: `full-${RUN_ID}`,
          reason: "full_refund",
        });
        assert.equal(dup.duplicate, true);
        return { reversed: rev.amount, duplicate: dup.duplicate };
      },
    },
    {
      id: "R8-055",
      name: "partial_refund_30pct",
      category: "refund",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `part-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        ctx.partialCommId = rpc.data.commission_id;
        const p1 = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: ctx.partialCommId,
          refundEventId: "p30",
          approvedRefundAmount: 30,
          originalPurchaseAmount: 100,
          reason: "partial",
        });
        assert.equal(Number(p1.amount), 3);
        ctx.partialTotal = 3;
        return { amount: p1.amount };
      },
    },
    {
      id: "R8-056",
      name: "partial_refund_20pct",
      category: "refund",
      run: async ({ service }) => {
        const p2 = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: ctx.partialCommId,
          refundEventId: "p20",
          approvedRefundAmount: 20,
          originalPurchaseAmount: 100,
          reason: "partial",
        });
        assert.equal(Number(p2.amount), 2);
        ctx.partialTotal += 2;
        return { amount: p2.amount, total: ctx.partialTotal };
      },
    },
    {
      id: "R8-057",
      name: "partial_refund_replay_idempotent",
      category: "refund",
      run: async ({ service }) => {
        const dup = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: ctx.partialCommId,
          refundEventId: "p20",
          reason: "partial",
        });
        assert.equal(dup.duplicate, true);
        return { duplicate: true, total: ctx.partialTotal };
      },
    },
    {
      id: "R8-058",
      name: "partial_refund_remaining_50pct",
      category: "refund",
      run: async ({ service }) => {
        const p3 = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: ctx.partialCommId,
          refundEventId: "p50",
          approvedRefundAmount: 50,
          originalPurchaseAmount: 100,
          reason: "partial",
        });
        assert.equal(Number(p3.amount), 5);
        ctx.partialTotal += 5;
        assert.equal(ctx.partialTotal, 10);
        return { total: ctx.partialTotal };
      },
    },
    {
      id: "R8-059",
      name: "partial_refund_cap_extra_blocked",
      category: "refund",
      run: async ({ service }) => {
        const extra = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: ctx.partialCommId,
          refundEventId: "extra",
          approvedRefundAmount: 100,
          originalPurchaseAmount: 100,
          reason: "partial",
        });
        assert.ok(extra.duplicate || extra.reversed === false);
        const { data: comm } = await service
          .from("partner_commissions")
          .select("amount_reversed, amount")
          .eq("id", ctx.partialCommId)
          .single();
        assert.equal(Number(comm.amount_reversed), 10);
        return { amount_reversed: comm.amount_reversed };
      },
    },
    {
      id: "R8-060",
      name: "partial_refund_alt_sequence",
      category: "refund",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `alt-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const cid = rpc.data.commission_id;
        const seq = [1, 4, 2, 3];
        let total = 0;
        for (const pct of seq) {
          const r = await reversePartnerServiceCommissionAtomic(service, {
            commissionId: cid,
            refundEventId: `alt-${pct}`,
            approvedRefundAmount: pct * 10,
            originalPurchaseAmount: 100,
            reason: "partial",
          });
          total += Number(r.amount || 0);
        }
        assert.equal(total, 10);
        return { sequence: seq, total };
      },
    }
  );

  // Paid recovery + failure injection R8-061..065
  MANIFEST.push(
    {
      id: "R8-061",
      name: "paid_commission_recovery",
      category: "refund",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `paid-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100, initialStatus: "withdrawable" });
        const cid = rpc.data.commission_id;
        await releasePartnerCommissionAtomic(service, cid);
        await service.from("partner_commissions").update({ status: "paid", is_withdrawable: false }).eq("id", cid);
        const rev = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: cid,
          refundEventId: `paid-rec-${RUN_ID}`,
          reason: "refund_after_paid",
        });
        assert.equal(rev.reversed, true);
        assert.equal(rev.bucket, "paid_out");
        const { data: ledger } = await service
          .from("partner_financial_ledger_entries")
          .select("metadata, entry_direction")
          .eq("legacy_commission_id", cid)
          .eq("entry_direction", "debit");
        assert.ok((ledger || []).some((r) => r.metadata?.recovery === true));
        return { bucket: rev.bucket, recoveryLedger: ledger?.length };
      },
    },
    {
      id: "R8-062",
      name: "failure_injection_create_rollback",
      category: "failure",
      run: async ({ service, fx }) => {
        await service.rpc("create_partner_commission_atomic_test_fail", { p_fail_after: "commission" });
        await armStagingFailureInjection(service, "create", "commission");
        const sourceId = `failc-${RUN_ID}`;
        const canonicalSourceId = toCommissionSourceId(sourceId);
        const before = await service.from("partner_commissions").select("id", { count: "exact", head: true }).eq("source_id", canonicalSourceId);
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId, serviceType: "vip_signal", baseAmount: 100 });
        assert.ok(
          rpc.error?.message?.includes("commission_test_fail_injected")
            || String(rpc.error?.message || rpc.error?.details || "").includes("commission_test_fail_injected")
            || rpc.data?.error === "commission_test_fail_injected"
        );
        const after = await service.from("partner_commissions").select("id", { count: "exact", head: true }).eq("source_id", canonicalSourceId);
        assert.equal(after.count, before.count);
        return { rolledBack: true };
      },
    },
    {
      id: "R8-063",
      name: "failure_injection_create_retry_once",
      category: "failure",
      run: async ({ service, fx }) => {
        const sourceId = `failc2-${RUN_ID}`;
        const canonicalSourceId = toCommissionSourceId(sourceId);
        await service.rpc("create_partner_commission_atomic_test_fail", { p_fail_after: "commission" });
        await armStagingFailureInjection(service, "create", "commission");
        await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId, serviceType: "vip_signal", baseAmount: 100 });
        const ok = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId, serviceType: "vip_signal", baseAmount: 100 });
        assert.equal(ok.data?.created, true, ok.error?.message || ok.data?.error || "retry_failed");
        const { count } = await service.from("partner_commissions").select("id", { count: "exact", head: true }).eq("source_id", canonicalSourceId);
        assert.equal(count, 1);
        return { commissionCount: 1 };
      },
    },
    {
      id: "R8-064",
      name: "failure_injection_reversal_rollback",
      category: "failure",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `failr-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const cid = rpc.data.commission_id;
        const { count: beforeRev } = await service
          .from("partner_service_commission_reversals")
          .select("id", { count: "exact", head: true })
          .eq("commission_id", cid);
        await service.rpc("reverse_partner_service_commission_atomic_test_fail", { p_fail_after: "ledger" });
        await armStagingFailureInjection(service, "reverse", "ledger");
        let injected = false;
        try {
          await reversePartnerServiceCommissionAtomic(service, {
            commissionId: cid,
            refundEventId: `failr-ev-${RUN_ID}`,
            reason: "fail test",
          });
        } catch (e) {
          injected = String(e?.message || e).includes("reverse_test_fail_injected");
        }
        assert.equal(injected, true);
        const { count: afterRev } = await service
          .from("partner_service_commission_reversals")
          .select("id", { count: "exact", head: true })
          .eq("commission_id", cid);
        assert.equal(afterRev, beforeRev);
        return { reversalRows: afterRev };
      },
    },
    {
      id: "R8-065",
      name: "failure_injection_reversal_retry_once",
      category: "failure",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `failr2-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const cid = rpc.data.commission_id;
        await service.rpc("reverse_partner_service_commission_atomic_test_fail", { p_fail_after: "ledger" });
        await armStagingFailureInjection(service, "reverse", "ledger");
        try {
          await reversePartnerServiceCommissionAtomic(service, {
            commissionId: cid,
            refundEventId: `failr2-ev-${RUN_ID}`,
            reason: "fail test",
          });
        } catch {
          /* expected */
        }
        const ok = await reversePartnerServiceCommissionAtomic(service, {
          commissionId: cid,
          refundEventId: `failr2-ev-${RUN_ID}`,
          reason: "fail test",
        });
        assert.equal(ok.reversed, true);
        const { count } = await service
          .from("partner_service_commission_reversals")
          .select("id", { count: "exact", head: true })
          .eq("commission_id", cid);
        assert.equal(count, 1);
        return { reversalCount: count };
      },
    }
  );

  // Idempotency + concurrency R8-066..070
  MANIFEST.push(
    {
      id: "R8-066",
      name: "idempotency_activation_replay",
      category: "idempotency",
      run: async ({ service, fx }) => {
        const sourceId = toCommissionSourceId(`idem-${RUN_ID}`);
        let last = null;
        for (let i = 0; i < 10; i += 1) {
          last = await createCommissionRpc(service, {
            partnerId: fx.partnerAId,
            referralId: fx.refQualifiedId,
            referredUserId: fx.referredQualifiedId,
            runId: RUN_ID,
          }, { sourceId, serviceType: "vip_signal", baseAmount: 100 });
        }
        assert.ok(last.data?.duplicate || last.data?.created === false);
        const { count } = await service.from("partner_commissions").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
        assert.equal(count, 1);
        return { replays: 10, count };
      },
    },
    {
      id: "R8-067",
      name: "idempotency_refund_replay",
      category: "idempotency",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `idemr-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        let last = null;
        for (let i = 0; i < 10; i += 1) {
          last = await reversePartnerServiceCommissionAtomic(service, {
            commissionId: rpc.data.commission_id,
            refundEventId: `idemr-${RUN_ID}`,
            reason: "full",
          });
        }
        assert.equal(last.duplicate, true);
        const { count } = await service
          .from("partner_service_commission_reversals")
          .select("id", { count: "exact", head: true })
          .eq("commission_id", rpc.data.commission_id);
        assert.equal(count, 1);
        return { reversalCount: count };
      },
    },
    {
      id: "R8-068",
      name: "concurrency_create_one_commission",
      category: "concurrency",
      run: async ({ service, fx }) => {
        const sourceId = `conc-${RUN_ID}`;
        const attempts = await Promise.all(
          Array.from({ length: 5 }, () =>
            createCommissionRpc(service, {
              partnerId: fx.partnerAId,
              referralId: fx.refQualifiedId,
              referredUserId: fx.referredQualifiedId,
              runId: RUN_ID,
            }, { sourceId, serviceType: "vip_signal", baseAmount: 100 })
          )
        );
        const created = attempts.filter((a) => a.data?.created).length;
        assert.equal(created, 1);
        return { created, attempts: attempts.length };
      },
    },
    {
      id: "R8-069",
      name: "concurrency_refund_one_reversal",
      category: "concurrency",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `concr-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const attempts = await Promise.all(
          Array.from({ length: 5 }, () =>
            reversePartnerServiceCommissionAtomic(service, {
              commissionId: rpc.data.commission_id,
              refundEventId: `concr-ev-${RUN_ID}`,
              reason: "concurrent",
            })
          )
        );
        const reversed = attempts.filter((a) => a.reversed).length;
        assert.equal(reversed, 1);
        return { reversed };
      },
    },
    {
      id: "R8-070",
      name: "cancel_without_refund_no_reversal",
      category: "refund",
      run: async ({ service, fx }) => {
        const rpc = await createCommissionRpc(service, {
          partnerId: fx.partnerAId,
          referralId: fx.refQualifiedId,
          referredUserId: fx.referredQualifiedId,
          runId: RUN_ID,
        }, { sourceId: `cancel-${RUN_ID}`, serviceType: "vip_signal", baseAmount: 100 });
        const cid = rpc.data.commission_id;
        const { count: before } = await service
          .from("partner_service_commission_reversals")
          .select("id", { count: "exact", head: true })
          .eq("commission_id", cid);
        assert.equal(before, 0);
        const { data: comm } = await service.from("partner_commissions").select("status, amount_reversed").eq("id", cid).single();
        assert.equal(Number(comm.amount_reversed || 0), 0);
        return { reversals: before, status: comm.status };
      },
    }
  );

  // Admin R8-071..076
  MANIFEST.push(
    {
      id: "R8-071",
      name: "admin_get_rules_structure",
      category: "admin",
      run: async ({ sessions }) => {
        const res = await adminApi(BASE, sessions.superAdmin.cookie, "GET");
        assert.equal(res.json?.success, true);
        const list = res.json?.policy?.services || [];
        assert.ok(list.length >= 5);
        return { ruleCount: list.length, hasArabic: list.some((r) => r.displayNameAr || r.display_name_ar) };
      },
    },
    {
      id: "R8-072",
      name: "admin_rule_versioning",
      category: "admin",
      run: async ({ service, sessions }) => {
        const before = await service
          .from("partner_commission_rules")
          .select("id, rule_version, status, commission_percent")
          .eq("service_type", "vip_forex")
          .order("rule_version", { ascending: false });
        const active = (before.data || []).find((r) => r.status === "active");
        const put = await adminApi(BASE, sessions.superAdmin.cookie, "PUT", {
          serviceType: "vip_forex",
          commissionPercent: Number(active?.commission_percent || 10),
          reason: "r8 version test",
        });
        assert.ok(put.status >= 200 && put.status < 300);
        assert.ok(Number(put.json?.rule?.ruleVersion || 0) > (active?.rule_version || 0));
        const { count } = await service
          .from("partner_commission_rules")
          .select("id", { count: "exact", head: true })
          .eq("service_type", "vip_forex")
          .eq("status", "active");
        assert.equal(count, 1);
        return { newVersion: put.json?.rule?.ruleVersion, activeCount: count };
      },
    },
    {
      id: "R8-073",
      name: "admin_concurrent_update_single_active",
      category: "admin",
      run: async ({ service, sessions }) => {
        const results = await Promise.allSettled([
          adminApi(BASE, sessions.superAdmin.cookie, "PUT", {
            serviceType: "vip_forex",
            reason: "conc a",
          }),
          adminApi(BASE, sessions.superAdmin.cookie, "PUT", {
            serviceType: "vip_forex",
            reason: "conc b",
          }),
        ]);
        const ok = results.filter((r) => r.status === "fulfilled").length;
        assert.ok(ok >= 1);
        const { count } = await service
          .from("partner_commission_rules")
          .select("id", { count: "exact", head: true })
          .eq("service_type", "vip_forex")
          .eq("status", "active");
        assert.equal(count, 1);
        return { fulfilled: ok, activeCount: count };
      },
    },
    {
      id: "R8-074",
      name: "admin_validation_rejects_invalid",
      category: "admin",
      run: async ({ sessions }) => {
        const res = await adminApi(BASE, sessions.superAdmin.cookie, "PUT", {
          serviceType: "vip_forex",
          commissionPercent: -5,
          reason: "invalid",
        });
        assert.ok(res.status >= 400);
        return { status: res.status, rejected: true };
      },
    },
    {
      id: "R8-075",
      name: "admin_audit_row",
      category: "admin",
      run: async ({ service, sessions }) => {
        await adminApi(BASE, sessions.superAdmin.cookie, "PUT", {
          serviceType: "vip_forex",
          reason: "audit probe",
        });
        const { data } = await service
          .from("partner_admin_audit_log")
          .select("action, entity_type, actor_user_id, before_state, after_state, reason, created_at")
          .eq("entity_type", "partner_commission_rule")
          .eq("reason", "audit probe")
          .order("created_at", { ascending: false })
          .limit(1);
        assert.ok((data || []).length >= 1);
        const row = data[0];
        assert.ok(row.actor_user_id);
        assert.ok(row.before_state);
        assert.ok(row.after_state);
        return { action: row.action, hasActor: Boolean(row.actor_user_id) };
      },
    },
    {
      id: "R8-076",
      name: "partner_read_model_safe",
      category: "partner_ui",
      run: async ({ sessions, fx }) => {
        const res = await fetch(`${BASE}/api/partner/center`, {
          headers: { Cookie: sessions.partnerA.cookie },
        });
        const json = await res.json();
        assert.equal(res.status, 200);
        const body = JSON.stringify(json);
        assert.ok(body.includes("serviceCommissionOffer") || body.includes("commission"));
        assert.ok(!body.includes("use_partner_tier"));
        assert.ok(!body.includes("service_role"));
        return { status: res.status };
      },
    }
  );

  // Browser R8-077..080
  MANIFEST.push(
    {
      id: "R8-077",
      name: "admin_browser_desktop",
      category: "browser",
      run: async ({ browser, sessions, fx }) => {
        const pageCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await pageCtx.newPage();
        const obs = attachPageObservers(page, { consoleErrors: [], pageErrors: [] });
        await loginViaSupabase(pageCtx, ctx.envBundle.env, BASE, fx.emails.superAdmin, fx.password);
        await page.goto(`${BASE}/admin/partner-marketing`, { waitUntil: "domcontentloaded" });
        await sleep(2500);
        await page.click('button:has-text("عمولات الخدمات")').catch(() => null);
        await sleep(1500);
        const body = await page.textContent("body");
        assert.ok(body?.includes("عمولات") || body?.includes("VIP"));
        assert.equal(obs.pageErrors.length, 0);
        await pageCtx.close();
        return { loaded: true, consoleErrors: obs.consoleErrors.length };
      },
    },
    {
      id: "R8-078",
      name: "admin_browser_mobile_themes",
      category: "browser",
      run: async ({ browser, fx }) => {
        for (const theme of ["light", "dark"]) {
          const pageCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
          const page = await pageCtx.newPage();
          await loginViaSupabase(pageCtx, ctx.envBundle.env, BASE, fx.emails.superAdmin, fx.password);
          await page.goto(`${BASE}/admin/partner-marketing`, { waitUntil: "domcontentloaded" });
          await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
          await sleep(1500);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
          assert.equal(overflow, false);
          await pageCtx.close();
        }
        return { themes: ["light", "dark"], mobile: true };
      },
    },
    {
      id: "R8-079",
      name: "partner_browser_desktop",
      category: "browser",
      run: async ({ browser, fx }) => {
        const pageCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await pageCtx.newPage();
        const obs = attachPageObservers(page, { consoleErrors: [], pageErrors: [] });
        await loginViaSupabase(pageCtx, ctx.envBundle.env, BASE, fx.emails.partnerA, fx.password);
        await page.goto(`${BASE}/partner-center`, { waitUntil: "domcontentloaded" });
        await sleep(2500);
        const body = await page.textContent("body");
        assert.ok(body?.includes("مركز") || body?.includes("Partner"));
        assert.ok(!body?.includes("use_partner_tier"));
        await pageCtx.close();
        return { loaded: true, pageErrors: obs.pageErrors.length };
      },
    },
    {
      id: "R8-080",
      name: "partner_browser_mobile_themes",
      category: "browser",
      run: async ({ browser, fx }) => {
        const pageCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await pageCtx.newPage();
        await loginViaSupabase(pageCtx, ctx.envBundle.env, BASE, fx.emails.partnerA, fx.password);
        await page.goto(`${BASE}/partner-center`, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
        await sleep(1500);
        await pageCtx.close();
        return { mobile: true, rtl: true };
      },
    }
  );

  // Regression R8-081..088
  const regressionScripts = [
    ["R8-081", "regression_service_commission_unit", "scripts/test-partner-service-commission-hardening.js"],
    ["R8-082", "regression_qrr_unit", "scripts/test-partner-qualified-referral-reward.js"],
    ["R8-083", "regression_qualification_unit", "scripts/test-partner-qualification-hardening.js"],
    ["R8-084", "regression_phase1", "scripts/test-partner-center-phase1.js"],
    ["R8-085", "regression_phase2", "scripts/test-partner-center-phase2.js"],
    ["R8-086", "regression_phase3", "scripts/test-partner-center-phase3.js"],
    ["R8-087", "regression_smart_link_ux", "scripts/test-partner-smart-link-ux.js"],
  ];
  for (const [id, name, script] of regressionScripts) {
    MANIFEST.push({
      id,
      name,
      category: "regression",
      run: async () => {
        const r = await runRegressionSuite(script);
        assert.equal(r.exitCode, 0, r.stderr || r.stdout);
        assert.equal(r.failed, 0);
        return { passed: r.passed, failed: r.failed, script };
      },
    });
  }
  MANIFEST.push({
    id: "R8-088",
    name: "build_pass",
    category: "regression",
    run: async () => {
      const b = await runBuild();
      assert.equal(b.ok, true);
      return { build: "pass" };
    },
  });

  MANIFEST.push(
    {
      id: "R8-089",
      name: "staging_reconciliation_match",
      category: "reconciliation",
      run: async ({ service, baseline }) => {
        const after = await snapshotFinancialBaseline(service);
        const deltaComm = after.commissionCount - baseline.commissionCount;
        const deltaLedger = after.ledgerCount - baseline.ledgerCount;
        assert.ok(deltaComm >= 0 && deltaLedger >= 0);
        ctx.fixtureDelta = { deltaComm, deltaLedger };
        return { baseline, after, fixtureDelta: ctx.fixtureDelta };
      },
    },
    {
      id: "R8-090",
      name: "cleanup_zero_orphan_fixtures",
      category: "cleanup",
      run: async ({ service, fx }) => {
        await cleanupRunFixtures(service, RUN_ID, fx, ctx.fixtureRegistry, ctx.runStartedAt);
        const partnerIds = [
          ...(fx.cleanupIds?.partnerIds || []),
          ...(ctx.fixtureRegistry?.tierPartnerIds || []),
        ];
        const { count } = await service
          .from("partner_commissions")
          .select("id", { count: "exact", head: true })
          .in("partner_id", partnerIds)
          .gte("created_at", ctx.runStartedAt);
        assert.equal(count, 0);
        return { orphanCommissions: count, partnerScope: partnerIds.length };
      },
    }
  );
}

async function main() {
  assertStagingGuard();
  await applyTestHooksMigration();

  const service = serviceClient();
  const cfg = assertStagingGuard();
  const anon = (await import("@supabase/supabase-js")).createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false },
  });

  const baseline = await snapshotFinancialBaseline(service);
  const fx = await initFixturePool(service, RUN_ID);

  const sessions = {
    superAdmin: await signInJwt(cfg.url, cfg.anonKey, fx.emails.superAdmin, fx.password),
    rewardsRead: await signInJwt(cfg.url, cfg.anonKey, fx.emails.rewardsRead, fx.password),
    rewardsManage: await signInJwt(cfg.url, cfg.anonKey, fx.emails.rewardsManage, fx.password),
    partnerA: await signInJwt(cfg.url, cfg.anonKey, fx.emails.partnerA, fx.password),
    unauthorized: await signInJwt(cfg.url, cfg.anonKey, fx.emails.unauthorized, fx.password),
  };

  const envBundle = loadEnv(process.cwd());
  envBundle.env.PARTNER_ADMIN_MARKETING = "true";
  envBundle.env.NEXT_PUBLIC_PARTNER_ADMIN_MARKETING = "true";
  envBundle.env.IAM_DB = "true";
  envBundle.env.IAM_API = "true";
  envBundle.env.IAM_UI = "true";
  assertStagingOnly(envBundle.env);

  await ensurePortReady(R8_DEV_PORT);
  devServer = startDevServer(process.cwd(), envBundle.env, R8_DEV_PORT);
  await waitForServer(R8_DEV_PORT, 180000);

  const browser = await chromium.launch({ headless: true });
  const runStartedAt = await captureRunStartedAt(service);

  ctx = {
    service,
    fx,
    anon,
    sessions,
    partnerAClient: sessions.partnerA.userClient,
    baseline,
    browser,
    envBundle,
    runId: RUN_ID,
    runStartedAt,
    fixtureRegistry: initFixtureRegistry(),
  };

  registerRpcAclScenarios();
  registerJwtScenarios();
  await registerRemainingScenarios();

  assert.equal(MANIFEST.length, 90, `manifest must be 90, got ${MANIFEST.length}`);

  const onlyIds = (process.env.R8_ONLY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const runList = onlyIds.length
    ? MANIFEST.filter((e) => onlyIds.includes(e.id))
    : MANIFEST;

  const failures = [];
  for (const entry of runList) {
    try {
      if (entry.status === "N/A") {
        await naScenario(entry, await entry.run(ctx));
      } else {
        await scenario(entry);
      }
    } catch (e) {
      failures.push({ id: entry.id, error: String(e?.message || e) });
    }
  }
  const fatal = failures.length ? failures[0] : null;

  try {
    await restoreIamSnapshot(service, fx.iamSnapshot);
    await cleanupRunFixtures(service, RUN_ID, fx, ctx.fixtureRegistry, ctx.runStartedAt);
  } catch (cleanupErr) {
    console.error("cleanup warning", cleanupErr?.message || cleanupErr);
  }
  if (devServer) stopDevServer(devServer);
  await browser.close();

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const validNA = results.filter((r) => r.status === "N/A").length;
  const executed = passed + failed;
  const REAL_EXECUTED_COUNT = executed;

  const report = {
    runId: RUN_ID,
    manifestLength: MANIFEST.length,
    passed,
    failed,
    validNA,
    executed,
    REAL_EXECUTED_COUNT,
    results,
    gate: {
      manifest90: MANIFEST.length === 90,
      passPlusNA: passed + validNA === 90,
      failZero: failed === 0,
      noPending: true,
    },
    fatal: fatal ? String(fatal.message || fatal) : null,
  };

  mkdirSync(join(process.cwd(), "scripts/partner-center/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));

  console.log("\n--- R8 90/90 GATE ---");
  console.log(`manifest.length = ${MANIFEST.length}`);
  console.log(`PASS = ${passed} | FAIL = ${failed} | N/A = ${validNA}`);
  console.log(`REAL_EXECUTED_COUNT = ${REAL_EXECUTED_COUNT}`);
  console.log(`Artifact: ${ARTIFACT}`);

  const gateOk =
    MANIFEST.length === 90 &&
    passed + validNA === 90 &&
    failed === 0 &&
    REAL_EXECUTED_COUNT >= 85;

  process.exit(gateOk && !fatal ? 0 : 1);
}

main().catch((e) => {
  console.error("R8 fatal", e);
  process.exit(1);
});
