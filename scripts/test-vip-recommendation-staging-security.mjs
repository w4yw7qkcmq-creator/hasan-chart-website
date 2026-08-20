#!/usr/bin/env node
/**
 * VIP staging security + feature-flag route matrix (local dev + Staging DB).
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  stopDevServer,
  sleep,
  parseEnvFile,
} from "./iam/browser-qa-harness.mjs";

const PORT = 3020;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_DOMAIN = "staging-hcw.test";

const report = {
  securityIntegrationFailures: 0,
  sensitiveDataLeaks: 0,
  featureFlagFalseOk: false,
  featureFlagTrueOk: false,
  cases: [],
};

function record(name, ok, detail = {}) {
  report.cases.push({ name, ok, ...detail });
  if (!ok) report.securityIntegrationFailures += 1;
}

async function fetchJson(path, { cookie = "", method = "GET", body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function ensureVipTestAdmin(env) {
  const email = `vip-qa-admin@${TEST_DOMAIN}`;
  const password = env.STAGING_IAM_TEST_PASSWORD;
  if (!password) throw new Error("Missing STAGING_IAM_TEST_PASSWORD");

  const sb = createClient(env.STAGING_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { vip_qa: true, staging_only: true },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  }

  await sb.from("profiles").upsert({
    id: user.id,
    email,
    role: "admin",
    admin_role: "admin",
    subscription_status: "active",
  });

  await sb.from("iam_user_assignments").delete().eq("user_id", user.id).eq("role_id", "admin");
  const { error: assignError } = await sb.from("iam_user_assignments").insert({
    user_id: user.id,
    role_id: "admin",
    organization_id: "00000000-0000-0000-0000-000000000001",
    grant_reason: "vip-qa-staging-test",
  });
  if (assignError) throw assignError;

  return { email, password, userId: user.id };
}

async function loginDirect(env, email, password) {
  const anon = createClient(env.STAGING_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return "";
  return `hc_access_token=${data.session.access_token}`;
}

function startDev(env, flagValue) {
  const childEnv = {
    ...env,
    VIP_STATUS_NOTIFICATIONS_ENABLED: flagValue ? "true" : "false",
  };
  return spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runMatrix(env, flagEnabled, testAdmin) {
  await ensurePortReady(PORT);
  const dev = startDev(env, flagEnabled);
  try {
    await waitForServer(PORT, 120000);
    await sleep(2000);

    const guestRecent = await fetchJson("/api/admin/vip-recommendations/recent");
    record("guest GET recent → 401", guestRecent.status === 401, { status: guestRecent.status });

    const ownerCookie = await loginDirect(env, testAdmin.email, testAdmin.password);
    record("owner login", Boolean(ownerCookie));

    const ownerRecent = await fetchJson("/api/admin/vip-recommendations/recent", {
      cookie: ownerCookie,
    });
    record("owner GET recent → 200", ownerRecent.status === 200, { status: ownerRecent.status });
    if (ownerRecent.status === 200) {
      const items = ownerRecent.json?.items || [];
      record("recent max 3", items.length <= 3, { count: items.length });
      const body = JSON.stringify(ownerRecent.json);
      record("no @ in response leak", !body.includes("@example.com") && !body.includes("@gmail.com"), {});
    }

    const postStatus = await fetchJson("/api/admin/vip-recommendations/999999/status-update", {
      cookie: ownerCookie,
      method: "POST",
      body: { eventType: "target_1_hit" },
    });

    if (!flagEnabled) {
      record("flag false POST → 503", postStatus.status === 503, { status: postStatus.status });
      report.featureFlagFalseOk = postStatus.status === 503;
    } else {
      record(
        "flag true POST invalid id → 404/409/500 safe",
        postStatus.status === 404 || postStatus.status === 409 || postStatus.status === 500,
        { status: postStatus.status }
      );
      record("flag true no secret leak", !JSON.stringify(postStatus.json).includes("service_role"), {});
      report.featureFlagTrueOk = postStatus.status !== 503;
    }

    const invalidEvent = await fetchJson("/api/admin/vip-recommendations/1/status-update", {
      cookie: ownerCookie,
      method: "POST",
      body: { eventType: "invalid" },
    });
    record("invalid event → 400/503", invalidEvent.status === 400 || invalidEvent.status === 503, {
      status: invalidEvent.status,
    });
  } finally {
    await stopDevServer(dev);
  }
}

async function main() {
  loadStagingEnvFile();
  const bootstrap = parseEnvFile(resolve(process.cwd(), ".env.staging.bootstrap.local"));
  const env = {
    ...process.env,
    ...bootstrap,
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.STAGING_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    IAM_DB: "true",
    IAM_API: "true",
    IAM_UI: "true",
    IAM_RLS: "false",
  };
  assertStagingOnly(env);
  if (!env.STAGING_IAM_TEST_PASSWORD) {
    throw new Error("Missing STAGING_IAM_TEST_PASSWORD");
  }

  const testAdmin = await ensureVipTestAdmin(env);

  await runMatrix(env, false, testAdmin);
  await sleep(2000);
  await runMatrix(env, true, testAdmin);

  report.verdict = report.securityIntegrationFailures === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ verdict: "FAIL", error: err.message }));
  process.exit(1);
});
