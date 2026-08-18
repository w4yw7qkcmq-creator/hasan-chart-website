#!/usr/bin/env node
/**
 * Staging-only admin auth resolver for browser QA harnesses.
 * Never writes to Production.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  assertStagingSupabaseConfig,
  extractSupabaseProjectRef,
  maskProjectRef,
} from "../../lib/staging-env-guard.js";
import { isIsolatedValidationTarget, loadIsolatedHarnessEnv } from "../../lib/isolated-env-guard.js";
import { parseEnvFile } from "./browser-qa-harness.mjs";

export const FIXTURE_DOMAIN = "staging-hcw.test";
export const ISOLATED_FIXTURE_DOMAIN = "isolated-hcw.test";
export const CANONICAL_SUPER_ADMIN_EMAIL = `iam-super-admin@${FIXTURE_DOMAIN}`;
export const ISOLATED_VALIDATION_ADMIN_EMAIL = `isolated-validation-admin@${ISOLATED_FIXTURE_DOMAIN}`;
const VALIDATION_ORG_ID = "00000000-0000-0000-0000-000000000001";

function maskEmail(email = "") {
  const value = String(email || "").trim();
  const [local, domain] = value.split("@");
  if (!domain) return "***";
  return `${(local || "").slice(0, 3)}***@${domain}`;
}

export function loadStagingBrowserEnv(root = process.cwd()) {
  const stagingFile = parseEnvFile(`${root}/.env.staging.local`);
  const bootstrap = parseEnvFile(`${root}/.env.staging.bootstrap.local`);
  const env = {
    ...process.env,
    ...stagingFile,
    ...bootstrap,
    STAGING_SUPABASE_URL: stagingFile.STAGING_SUPABASE_URL || process.env.STAGING_SUPABASE_URL,
    STAGING_SUPABASE_ANON_KEY: stagingFile.STAGING_SUPABASE_ANON_KEY || process.env.STAGING_SUPABASE_ANON_KEY,
    STAGING_SUPABASE_SERVICE_ROLE_KEY:
      stagingFile.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    STAGING_SUPABASE_PROJECT_REF:
      stagingFile.STAGING_SUPABASE_PROJECT_REF || process.env.STAGING_SUPABASE_PROJECT_REF,
  };
  env.NEXT_PUBLIC_SUPABASE_URL = env.STAGING_SUPABASE_URL;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.STAGING_SUPABASE_ANON_KEY;
  env.SUPABASE_SERVICE_ROLE_KEY = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;

  assertStagingSupabaseConfig({
    projectRef: env.STAGING_SUPABASE_PROJECT_REF,
    url: env.STAGING_SUPABASE_URL,
  });

  const urlRef = extractSupabaseProjectRef(env.STAGING_SUPABASE_URL);
  if (urlRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: staging URL points to production");
  }
  if (urlRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: unexpected staging ref ${maskProjectRef(urlRef)}`);
  }

  return env;
}

function mergeHarnessSecretsOnly(env, root) {
  const bootstrap = parseEnvFile(`${root}/.env.staging.bootstrap.local`);
  const stagingSecrets = parseEnvFile(`${root}/.env.staging.local`);
  const skipKey = (key) =>
    key.startsWith("STAGING_SUPABASE_") ||
    key.startsWith("ISOLATED_SUPABASE_") ||
    key === "NEXT_PUBLIC_SUPABASE_URL" ||
    key === "NEXT_PUBLIC_SUPABASE_ANON_KEY";
  for (const [key, value] of Object.entries({ ...stagingSecrets, ...bootstrap })) {
    if (skipKey(key)) continue;
    if (env[key] == null || env[key] === "") env[key] = value;
  }
  env.NEXT_PUBLIC_SUPABASE_URL = env.STAGING_SUPABASE_URL;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.STAGING_SUPABASE_ANON_KEY;
  env.SUPABASE_SERVICE_ROLE_KEY = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  return env;
}

/** Target-aware browser/dev env — isolated keeps Supabase refs from isolated harness only. */
export function loadValidationBrowserEnv(root = process.cwd()) {
  if (isIsolatedValidationTarget()) {
    loadIsolatedHarnessEnv(root);
    return mergeHarnessSecretsOnly({ ...process.env }, root);
  }
  return loadStagingBrowserEnv(root);
}

export function createStagingServiceClient(env) {
  return createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function resolveTestPassword(env) {
  return (
    env.STAGING_IAM_TEST_PASSWORD ||
    env.STAGING_OWNER_PASSWORD ||
    `StagingClosure!${randomBytes(6).toString("hex")}`
  );
}

export async function diagnoseStagingUser(service, email) {
  const normalized = String(email || "").trim().toLowerCase();
  const { data: list, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const authUser = list?.users?.find((u) => u.email?.toLowerCase() === normalized) || null;
  if (!authUser) {
    return { exists: false, email: normalized };
  }

  const { data: profile } = await service
    .from("profiles")
    .select("id,email,role,admin_role,account_status")
    .eq("id", authUser.id)
    .maybeSingle();

  const { data: assignments } = await service
    .from("iam_user_assignments")
    .select("role_id,revoked_at")
    .eq("user_id", authUser.id)
    .is("revoked_at", null);

  const bannedUntil = authUser.banned_until ? new Date(authUser.banned_until).getTime() : 0;

  return {
    exists: true,
    email: normalized,
    userId: authUser.id,
    confirmed: Boolean(authUser.email_confirmed_at),
    banned: bannedUntil > Date.now(),
    deleted: Boolean(authUser.deleted_at),
    lastSignInAt: authUser.last_sign_in_at || null,
    hasProfile: Boolean(profile),
    profileRole: profile?.role || null,
    iamRoles: (assignments || []).map((row) => row.role_id),
    providers: (authUser.app_metadata?.providers || authUser.identities?.map((i) => i.provider) || []).join(","),
  };
}

export async function tryPasswordLogin(env, email, password) {
  const anon = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  return {
    ok: Boolean(data?.session?.access_token) && !error,
    error: error?.message || null,
  };
}

async function ensureSuperAdminFixture(service, env, report) {
  const email = CANONICAL_SUPER_ADMIN_EMAIL;
  const password = resolveTestPassword(env);
  const meta = { e2e: true, iam_test: true, staging_only: true, browser_closure: true };

  const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let created = false;

  if (!user) {
    const createdResult = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (createdResult.error) throw createdResult.error;
    user = createdResult.data.user;
    created = true;
  } else {
    await service.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: meta,
    });
  }

  await service.from("profiles").upsert({
    id: user.id,
    email,
    username: "iam-super-admin",
    role: "user",
    admin_role: null,
  });

  const { data: active } = await service
    .from("iam_user_assignments")
    .select("id,organization_id")
    .eq("user_id", user.id)
    .eq("role_id", "super_admin")
    .is("revoked_at", null)
    .maybeSingle();

  if (!active) {
    await service.from("iam_user_assignments").insert({
      user_id: user.id,
      role_id: "super_admin",
      organization_id: "00000000-0000-0000-0000-000000000001",
      grant_reason: "admin-users-browser-closure",
    });
  } else if (!active.organization_id) {
    await service
      .from("iam_user_assignments")
      .update({ organization_id: "00000000-0000-0000-0000-000000000001" })
      .eq("id", active.id);
  }

  report.resolution = {
    method: created ? "created_canonical_super_admin_fixture" : "reset_canonical_super_admin_fixture",
    maskedEmail: maskEmail(email),
    userId: user.id,
    created,
    preExisting: !created,
  };

  return { email, password, userId: user.id, created, preExisting: !created, cleanup: false };
}

async function ensureTemporaryClosureAdmin(service, env, report) {
  const runId = Date.now();
  const email = `admin-users-browser-closure-${runId}@${FIXTURE_DOMAIN}`;
  const password = resolveTestPassword(env);
  const meta = {
    e2e: true,
    iam_test: true,
    staging_only: true,
    browser_closure_temp: true,
    run_id: runId,
  };

  const createdResult = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (createdResult.error) throw createdResult.error;
  const user = createdResult.data.user;

  await service.from("profiles").upsert({
    id: user.id,
    email,
    username: `au-closure-${runId}`,
    role: "user",
  });

  await service.from("iam_user_assignments").insert({
    user_id: user.id,
    role_id: "super_admin",
    organization_id: "00000000-0000-0000-0000-000000000001",
    grant_reason: "admin-users-browser-closure-temp",
  });

  report.resolution = {
    method: "created_temporary_closure_admin",
    maskedEmail: maskEmail(email),
    userId: user.id,
    created: true,
    preExisting: false,
    runId,
  };

  return { email, password, userId: user.id, created: true, preExisting: false, cleanup: true, runId };
}

async function resetStagingOwnerPassword(service, env, email, report) {
  const normalized = String(email || "").trim().toLowerCase();
  if (normalized !== "staging@hasanchartworld.com") {
    throw new Error("refusing_password_reset_for_non_staging_owner");
  }

  const diagnosis = await diagnoseStagingUser(service, normalized);
  if (!diagnosis.exists) return null;

  const password = resolveTestPassword(env);
  await service.auth.admin.updateUserById(diagnosis.userId, {
    password,
    email_confirm: true,
  });

  report.ownerPasswordReset = {
    applied: true,
    maskedEmail: maskEmail(normalized),
    userId: diagnosis.userId,
    stagingOnly: true,
  };

  return { email: normalized, password, userId: diagnosis.userId };
}

export async function resolveStagingAdminCredentials(env, report = {}) {
  const service = createStagingServiceClient(env);
  const attempts = [];

  const ownerCandidates = [
    env.IAM_OWNER_EMAIL,
    env.STAGING_OWNER_EMAIL,
    "staging@hasanchartworld.com",
  ].filter(Boolean);

  const passwordCandidates = [
    env.STAGING_OWNER_PASSWORD,
    env.STAGING_IAM_TEST_PASSWORD,
  ].filter(Boolean);

  for (const email of [...new Set(ownerCandidates.map((v) => String(v).toLowerCase()))]) {
    const diagnosis = await diagnoseStagingUser(service, email);
    report.ownerDiagnosis = diagnosis;

    for (const password of passwordCandidates) {
      const login = await tryPasswordLogin(env, email, password);
      attempts.push({
        kind: "existing_owner_candidate",
        maskedEmail: maskEmail(email),
        ok: login.ok,
        error: login.error,
        diagnosisExists: diagnosis.exists,
      });
      if (login.ok) {
        report.resolution = {
          method: "existing_env_credentials",
          maskedEmail: maskEmail(email),
          userId: diagnosis.userId || null,
          created: false,
          preExisting: true,
        };
        return { email, password, userId: diagnosis.userId, created: false, preExisting: true, cleanup: false, attempts };
      }
    }
  }

  const ownerReset = await resetStagingOwnerPassword(service, env, "staging@hasanchartworld.com", report);
  if (ownerReset) {
    const login = await tryPasswordLogin(env, ownerReset.email, ownerReset.password);
    attempts.push({
      kind: "staging_owner_password_reset",
      maskedEmail: maskEmail(ownerReset.email),
      ok: login.ok,
      error: login.error,
    });
    if (login.ok) {
      report.resolution = {
        method: "staging_owner_password_reset",
        maskedEmail: maskEmail(ownerReset.email),
        userId: ownerReset.userId,
        created: false,
        preExisting: true,
      };
      return {
        ...ownerReset,
        created: false,
        preExisting: true,
        cleanup: false,
        attempts,
      };
    }
  }

  const canonical = await ensureSuperAdminFixture(service, env, report);
  const canonicalLogin = await tryPasswordLogin(env, canonical.email, canonical.password);
  attempts.push({
    kind: "canonical_super_admin_fixture",
    maskedEmail: maskEmail(canonical.email),
    ok: canonicalLogin.ok,
    error: canonicalLogin.error,
  });
  if (canonicalLogin.ok) {
    return { ...canonical, attempts };
  }

  const temp = await ensureTemporaryClosureAdmin(service, env, report);
  const tempLogin = await tryPasswordLogin(env, temp.email, temp.password);
  attempts.push({
    kind: "temporary_closure_admin",
    maskedEmail: maskEmail(temp.email),
    ok: tempLogin.ok,
    error: tempLogin.error,
  });
  if (!tempLogin.ok) {
    report.attempts = attempts;
    throw new Error("staging_admin_auth_resolution_failed");
  }
  return { ...temp, attempts };
}

/** Isolated/staging canonical validation super-admin — creates real IAM authority, no staging UUID copy. */
export async function ensureValidationSuperAdminFixture(service, env, report = {}) {
  const { ensureValidationIamReferenceBaseline } = await import("../partner-center/r8-staging-harness-lib.mjs");
  await ensureValidationIamReferenceBaseline(service);

  const email = isIsolatedValidationTarget() ? ISOLATED_VALIDATION_ADMIN_EMAIL : CANONICAL_SUPER_ADMIN_EMAIL;
  const password = resolveTestPassword(env);
  const meta = {
    e2e: true,
    iam_test: true,
    validation_admin: true,
    isolated_validation: isIsolatedValidationTarget(),
    persistent_reference_identity: true,
  };

  const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let created = false;

  if (!user) {
    const createdResult = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (createdResult.error) throw createdResult.error;
    user = createdResult.data.user;
    created = true;
  } else {
    await service.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: meta,
    });
  }

  await service.from("profiles").upsert({
    id: user.id,
    email,
    username: email.split("@")[0],
    role: "user",
    admin_role: null,
  });

  const roleId = "admin";
  const { data: active } = await service
    .from("iam_user_assignments")
    .select("id,organization_id,role_id")
    .eq("user_id", user.id)
    .eq("role_id", roleId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!active) {
    await service.from("iam_user_assignments").delete().eq("user_id", user.id);
    await service.from("iam_user_assignments").insert({
      user_id: user.id,
      role_id: roleId,
      organization_id: VALIDATION_ORG_ID,
      grant_reason: "validation-admin-fixture",
    });
  } else if (active.organization_id !== VALIDATION_ORG_ID) {
    await service
      .from("iam_user_assignments")
      .update({ organization_id: VALIDATION_ORG_ID })
      .eq("id", active.id);
  }

  report.validationAdminFixture = {
    method: created ? "created_validation_admin_fixture" : "reused_validation_admin_fixture",
    maskedEmail: maskEmail(email),
    userId: user.id,
    role: roleId,
    organizationId: VALIDATION_ORG_ID,
    persistentReferenceIdentity: true,
    stagingOwnerEmailUsed: false,
    stagingUuidCopied: false,
  };

  return {
    userId: user.id,
    email,
    password,
    role: roleId,
    organizationId: VALIDATION_ORG_ID,
    created,
    preExisting: !created,
    cleanup: false,
  };
}

/** Target-aware admin resolution — isolated uses validation fixture, staging keeps legacy path. */
export async function resolveValidationAdminCredentials(env, report = {}) {
  if (isIsolatedValidationTarget()) {
    const service = createStagingServiceClient(env);
    const fixture = await ensureValidationSuperAdminFixture(service, env, report);
    const login = await tryPasswordLogin(env, fixture.email, fixture.password);
    const attempts = [
      {
        kind: "isolated_validation_admin",
        maskedEmail: maskEmail(fixture.email),
        ok: login.ok,
        error: login.error,
      },
    ];
    if (!login.ok) {
      report.attempts = attempts;
      throw new Error("validation_admin_auth_resolution_failed");
    }
    report.resolution = {
      method: "isolated_validation_admin_fixture",
      maskedEmail: maskEmail(fixture.email),
      userId: fixture.userId,
      role: fixture.role,
      organizationId: fixture.organizationId,
      created: fixture.created,
      preExisting: fixture.preExisting,
      stagingOwnerEmailUsed: false,
    };
    return { ...fixture, attempts };
  }
  return resolveStagingAdminCredentials(env, report);
}

export async function cleanupTemporaryClosureAdmin(env, session) {
  if (!session?.cleanup || !session?.userId) return { cleaned: false };
  const service = createStagingServiceClient(env);
  await service.from("iam_user_assignments").delete().eq("user_id", session.userId);
  await service.from("profiles").delete().eq("id", session.userId);
  await service.auth.admin.deleteUser(session.userId);
  return { cleaned: true, userId: session.userId };
}

export async function ensureUsersReadOnlyFixture(service, env, report) {
  const email = `admin-users-read-only@${FIXTURE_DOMAIN}`;
  const password = resolveTestPassword(env);
  const meta = { e2e: true, iam_test: true, staging_only: true, users_read_only: true };
  const roleId = "users_read_only_browser_closure";

  await service.from("iam_roles").upsert({
    id: roleId,
    label: "Users Read Only Browser Closure",
    description: "Temporary staging browser closure read-only users",
    is_system: false,
    sort_order: 99,
  });
  await service.from("iam_role_permissions").upsert(
    { role_id: roleId, permission_id: "users.read", effect: "allow" },
    { onConflict: "role_id,permission_id" }
  );

  const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let created = false;

  if (!user) {
    const createdResult = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (createdResult.error) throw createdResult.error;
    user = createdResult.data.user;
    created = true;
  } else {
    await service.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: meta });
  }

  await service.from("profiles").upsert({ id: user.id, email, username: "users-read-only", role: "user" });
  await service.from("iam_user_assignments").delete().eq("user_id", user.id);
  await service.from("iam_user_assignments").insert({
    user_id: user.id,
    role_id: roleId,
    organization_id: "00000000-0000-0000-0000-000000000001",
    grant_reason: "admin-users-browser-closure-read-only",
  });

  report.usersReadOnlyFixture = { maskedEmail: maskEmail(email), userId: user.id, created, roleId };
  return { email, password, userId: user.id, created };
}
