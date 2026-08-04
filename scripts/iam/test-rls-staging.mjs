#!/usr/bin/env node
/**
 * Staging RLS integration runner — default --static (no live DB).
 * Modes: --static | --simulate | --live
 */
import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  RLS_TABLE_INVENTORY,
  countExpectedEnforcePolicies,
  countExpectedOwnPolicies,
} from "../../lib/iam/rls-permission-map.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  assertStagingSupabaseConfig,
} from "../../lib/staging-env-guard.js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";

const TEST_DOMAIN = "staging-hcw.test";

function getTestPassword() {
  const password = process.env.STAGING_IAM_TEST_PASSWORD;
  if (!password) {
    throw new Error("Missing STAGING_IAM_TEST_PASSWORD (set in .env.staging.local for live RLS tests)");
  }
  return password;
}

const ACTORS = [
  { key: "normal", email: `iam-test-normal-user@${TEST_DOMAIN}`, expectProfilesReadOthers: false, expectProfilesReadOwn: true },
  { key: "support", email: `iam-test-support@${TEST_DOMAIN}`, expectProfilesReadOthers: true, expectProfilesReadOwn: true },
  { key: "accountant", email: `iam-test-accountant@${TEST_DOMAIN}`, expectProfilesReadOthers: true, expectFinanceDenied: false },
  { key: "analyst", email: `iam-test-analyst@${TEST_DOMAIN}`, expectProfilesReadOthers: true },
  { key: "news_editor", email: `iam-test-news-editor@${TEST_DOMAIN}`, expectProfilesReadOthers: false },
  { key: "subscription_manager", email: `iam-test-subscription-manager@${TEST_DOMAIN}`, expectProfilesReadOthers: false },
  { key: "super_admin", email: "staging@hasanchartworld.com", expectProfilesReadOthers: true },
];

const { values } = parseArgs({
  options: {
    static: { type: "boolean", default: false },
    simulate: { type: "boolean", default: false },
    live: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const mode = values.live ? "live" : values.simulate ? "simulate" : "static";

function record(results, entry) {
  results.push(entry);
  return entry.ok;
}

async function ensureTestPassword(serviceClient, email) {
  const { data: list } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (list?.users || []).find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
  if (!user) return { ok: false, error: "user_not_found" };
  await serviceClient.auth.admin.updateUserById(user.id, { password: getTestPassword(), email_confirm: true });
  return { ok: true, userId: user.id };
}

async function loginAnon(url, anonKey, email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: getTestPassword() });
  if (error) return { ok: false, client, error: error.message };
  return { ok: true, client, userId: data.user?.id };
}

async function runStatic() {
  return {
    mode: "static",
    ok: true,
    inventoryTables: Object.keys(RLS_TABLE_INVENTORY).length,
    expectedEnforcePolicies: countExpectedEnforcePolicies(),
    expectedOwnPolicies: countExpectedOwnPolicies(),
    note: "Static mode — no Staging connection",
  };
}

async function runSimulate() {
  const matrix = [];
  for (const [table, spec] of Object.entries(RLS_TABLE_INVENTORY)) {
    if (spec.serviceRoleOnly) continue;
    matrix.push({
      table,
      category: spec.category,
      ownSelect: Boolean(spec.policies?.ownSelect),
      adminSelect: Boolean(spec.policies?.adminSelect || spec.policies?.adminAll),
    });
  }
  return { mode: "simulate", ok: true, matrixRows: matrix.length, matrix };
}

async function runLive() {
  const staging = loadStagingEnvFile();
  assertStagingSupabaseConfig(staging);
  if (staging.projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Production ref rejected");
  }

  const url = process.env.STAGING_SUPABASE_URL;
  const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
  const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  const results = [];
  let ok = true;

  const health = await service.rpc("iam_rls_health_probe");
  ok = record(results, {
    actor: "service_role",
    check: "health_probe",
    ok: !health.error && health.data?.enforcePoliciesPresent === true && health.data?.dualPoliciesPresent === false,
    detail: health.error?.message || { rlsEnabled: health.data?.rlsEnabled, enforce: health.data?.enforcePoliciesPresent },
  }) && ok;

  for (const actor of ACTORS) {
    const ensured = await ensureTestPassword(service, actor.email);
    if (!ensured.ok) {
      ok = record(results, { actor: actor.key, check: "ensure_user", ok: false, error: ensured.error }) && false;
      continue;
    }
    const session = await loginAnon(url, anonKey, actor.email);
    if (!session.ok) {
      ok = record(results, { actor: actor.key, check: "login", ok: false, error: session.error }) && false;
      continue;
    }

    const { data: ownProfile, error: ownErr } = await session.client
      .from("profiles")
      .select("id")
      .eq("id", session.userId)
      .maybeSingle();
    ok = record(results, {
      actor: actor.key,
      check: "profiles_select_own",
      ok: !ownErr && Boolean(ownProfile?.id),
      error: ownErr?.message || null,
    }) && ok;

    const { data: others, error: othersErr } = await session.client.from("profiles").select("id").neq("id", session.userId).limit(1);
    const othersAllowed = Array.isArray(others) && others.length > 0;
    const expectOthers = actor.expectProfilesReadOthers !== false;
    ok = record(results, {
      actor: actor.key,
      check: "profiles_select_other",
      ok: expectOthers ? othersAllowed && !othersErr : !othersAllowed || (others?.length ?? 0) === 0,
      expected: expectOthers ? "allow" : "deny",
      actual: othersAllowed ? "allow" : "deny",
      error: othersErr?.message || null,
    }) && ok;

    const { error: iamInsertErr } = await session.client.from("iam_user_assignments").insert({
      user_id: session.userId,
      role_id: "admin",
      organization_id: "00000000-0000-0000-0000-000000000001",
    });
    ok = record(results, {
      actor: actor.key,
      check: "iam_assignments_insert_denied",
      ok: Boolean(iamInsertErr),
      error: iamInsertErr ? "denied_as_expected" : "unexpected_allow",
    }) && ok;

    const { error: roleUpdateErr } = await session.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", session.userId);
    ok = record(results, {
      actor: actor.key,
      check: "profiles_role_update_denied",
      ok: Boolean(roleUpdateErr),
      error: roleUpdateErr ? "denied_as_expected" : "unexpected_allow",
    }) && ok;

    await session.client.auth.signOut();
  }

  const { count: srProfiles } = await service.from("profiles").select("id", { count: "exact", head: true });
  ok = record(results, {
    actor: "service_role",
    check: "profiles_select",
    ok: (srProfiles ?? 0) > 0,
    count: srProfiles,
  }) && ok;

  return { mode: "live", ok, results, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

async function main() {
  let result;
  if (mode === "live") result = await runLive();
  else if (mode === "simulate") result = await runSimulate();
  else result = await runStatic();

  const artifact = {
    ...result,
    timestamp: new Date().toISOString(),
    stagingRefMasked: maskProjectRef(process.env.STAGING_SUPABASE_PROJECT_REF || "unset"),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
  };

  const dir = join(process.cwd(), "scripts/iam/.artifacts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "rls-integration-results.json"), JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ ok: artifact.ok, mode: artifact.mode, passed: artifact.passed, failed: artifact.failed, results: artifact.results?.slice?.(0, 5) }, null, 2));
  process.exit(artifact.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
