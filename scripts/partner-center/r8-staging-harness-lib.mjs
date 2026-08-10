/**
 * Round 8 staging validation — shared harness utilities (STAGING ONLY).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import { transitionReferralQualification, initializeReferralQualification } from "../../lib/partner-center/qualification-engine.js";
import { QUALIFICATION_STATES, FRAUD_RISK_LEVELS } from "../../lib/partner-center/constants.js";
import { releasePartnerCommissionAtomic, reversePartnerServiceCommissionAtomic } from "../../lib/partner-center/financial-gateway.js";

export const R8_DEV_PORT = 3024;
export const FIXTURE_DOMAIN = "staging-hcw.test";

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
  if (ref !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: unexpected staging ref ${ref}`);
  }
  assertLinkedStagingProject();
  console.log("STAGING_GUARD_OK");
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

function assertLinkedStagingProject() {
  const linkedPath = join(process.cwd(), "supabase/.temp/project-ref");
  if (!existsSync(linkedPath)) {
    throw new Error("ABORT: supabase CLI is not linked — link staging before running R8");
  }
  const linked = readFileSync(linkedPath, "utf8").trim();
  if (linked === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(
      `ABORT: supabase CLI linked to Production (${linked}). Run: npx supabase link --project-ref ${STAGING_SUPABASE_PROJECT_REF}`
    );
  }
  if (linked !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: supabase CLI linked to ${linked}, expected ${STAGING_SUPABASE_PROJECT_REF}`);
  }
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

export async function ensureUser(service, email, password, meta = {}) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error && !String(error.message).includes("already")) throw error;
  if (data?.user?.id) return data.user.id;
  const { data: list } = await service.auth.admin.listUsers({ perPage: 500 });
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found?.id) throw new Error(`user_missing:${email}`);
  await service.auth.admin.updateUserById(found.id, { password, email_confirm: true });
  return found.id;
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
    await service.from("iam_role_permissions").upsert(
      { role_id: roleId, permission_id, effect: "allow" },
      { onConflict: "role_id,permission_id" }
    );
  }
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

export async function initFixturePool(service, runId) {
  const password = process.env.STAGING_IAM_TEST_PASSWORD || "StagingTestPass!2026";
  const tag = `r8_${runId}`;
  const emails = {
    superAdmin: `r8-super-admin@${FIXTURE_DOMAIN}`,
    rewardsRead: `r8-rewards-read@${FIXTURE_DOMAIN}`,
    rewardsManage: `r8-rewards-manage@${FIXTURE_DOMAIN}`,
    partnerA: `r8-partner-a@${FIXTURE_DOMAIN}`,
    partnerB: `r8-partner-b@${FIXTURE_DOMAIN}`,
    unauthorized: `r8-unauthorized@${FIXTURE_DOMAIN}`,
    referredVerified: `r8-referred-verified@${FIXTURE_DOMAIN}`,
    referredQualified: `r8-referred-qualified@${FIXTURE_DOMAIN}`,
    referredInvalid: `r8-referred-invalid@${FIXTURE_DOMAIN}`,
    partnerFraudHigh: `r8-partner-fraud-high@${FIXTURE_DOMAIN}`,
    referredFraudHigh: `r8-referred-fraud-high@${FIXTURE_DOMAIN}`,
  };

  const meta = { r8_fixture: true, run_id: runId };
  const superAdminId = await ensureUser(service, emails.superAdmin, password, meta);
  const rewardsReadId = await ensureUser(service, emails.rewardsRead, password, meta);
  const rewardsManageId = await ensureUser(service, emails.rewardsManage, password, meta);
  const partnerAUserId = await ensureUser(service, emails.partnerA, password, meta);
  const partnerBUserId = await ensureUser(service, emails.partnerB, password, meta);
  const unauthorizedId = await ensureUser(service, emails.unauthorized, password, meta);
  const referredVerifiedId = await ensureUser(service, emails.referredVerified, password, meta);
  const referredQualifiedId = await ensureUser(service, emails.referredQualified, password, meta);
  const referredInvalidId = await ensureUser(service, emails.referredInvalid, password, meta);
  const partnerFraudHighUserId = await ensureUser(service, emails.partnerFraudHigh, password, meta);
  const referredFraudHighId = await ensureUser(service, emails.referredFraudHigh, password, meta);

  await service.from("profiles").upsert([
    { id: superAdminId, email: emails.superAdmin, role: "admin" },
    { id: rewardsReadId, email: emails.rewardsRead, role: "user" },
    { id: rewardsManageId, email: emails.rewardsManage, role: "user" },
    { id: partnerAUserId, email: emails.partnerA, role: "user" },
    { id: partnerBUserId, email: emails.partnerB, role: "user" },
    { id: unauthorizedId, email: emails.unauthorized, role: "user" },
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
    const { data, error } = await service
      .from("partners")
      .insert({ user_id: userId, referral_code: code, status: "active", tier_key: tierKey })
      .select("id")
      .single();
    if (error?.code === "23505") {
      const ex = await service.from("partners").select("id").eq("user_id", userId).single();
      if (tierKey !== "partner") await service.from("partners").update({ tier_key: tierKey }).eq("id", ex.data.id);
      return ex.data.id;
    }
    if (error) throw error;
    return data.id;
  };

  const partnerAId = await mkPartner(partnerAUserId, `R8A${runId.slice(-6)}`, "partner");
  const partnerBId = await mkPartner(partnerBUserId, `R8B${runId.slice(-6)}`, "partner");

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

export async function createCommissionRpc(service, fx, opts) {
  const sourceId = toCommissionSourceId(opts.sourceId);
  const runTag = fx.runId || fx.runTag || "";
  const idem =
    opts.idempotencyKey ||
    ["r8", runTag, fx.partnerId, fx.referredUserId, opts.serviceType, sourceId].filter(Boolean).join(":");
  return service.rpc("create_partner_commission_atomic", {
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
  const email = `r8-tier-${tierKey}-${runTag}@${FIXTURE_DOMAIN}`;
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
  const referredEmail = `r8-tier-ref-${tierKey}-${runTag}@${FIXTURE_DOMAIN}`;
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
    subscriptionIds: [],
  };
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
    await service.from("partner_center_staging_test_flags").delete().neq("flag_key", "");
  } catch {
    /* staging-only */
  }
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

export async function armStagingFailureInjection(service, kind, value = "commission") {
  const key = kind === "reverse" ? "reverse_fail_after" : "create_fail_after";
  const { error } = await service.from("partner_center_staging_test_flags").upsert({
    flag_key: key,
    flag_value: String(value),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
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

async function purgeRunCommissionsRpc(service, partnerIds, runStartedAt) {
  const uniquePartnerIds = [...new Set(partnerIds.filter(Boolean))];
  if (!uniquePartnerIds.length) return { deleted: 0 };
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

export async function cleanupRunFixtures(service, runId, fx, registry = null, runStartedAt = null) {
  const like = `%${runId}%`;
  const runToken = String(runId).replace(/^r8_/, "").split("-")[0];
  const likeToken = runToken ? `%${runToken}%` : like;
  const partnerIds = [
    ...(fx?.cleanupIds?.partnerIds || []),
    ...(registry?.tierPartnerIds || []),
  ];
  await clearStagingFailureFlags(service);
  try {
    await service.from("partner_service_commission_reversals").delete().filter("idempotency_key", "like", like);
  } catch { /* optional table rows */ }
  if (runStartedAt && partnerIds.length) {
    const uniquePartnerIds = [...new Set(partnerIds.filter(Boolean))];
    await purgeRunCommissionsRpc(service, uniquePartnerIds, runStartedAt);
  }
  try {
    const { data: runSubs } = await service
      .from("subscription_requests")
      .select("id")
      .or(`payment_proof_path.like.r8/${runId}%,payment_proof_path.like.%${runToken}%`);
    const subSourceIds = (runSubs || []).map((row) => String(row.id)).filter(Boolean);
    if (subSourceIds.length) {
      await service.from("partner_commissions").delete().in("source_id", subSourceIds);
    }
  } catch { /* optional */ }
  await service.from("partner_service_commission_entitlements").delete().filter("idempotency_key", "like", like);
  for (const pid of registry?.tierPartnerIds || []) {
    await service.from("partner_commissions").delete().eq("partner_id", pid).filter("idempotency_key", "like", like);
    await service.from("partner_commissions").delete().eq("partner_id", pid).filter("idempotency_key", "like", likeToken);
  }
  await service.from("partner_commissions").delete().filter("idempotency_key", "like", likeToken);
  await service.from("partner_commissions").delete().filter("idempotency_key", "like", like);
  await service.from("partner_commissions").delete().eq("invited_username", "r8").filter("idempotency_key", "like", likeToken);
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

export async function adminApi(base, cookie, method, body) {
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
