/**
 * Staging IAM UI hardening — HTTP leakage + deny-wins validation.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { validatePageMatrix } from "../../lib/iam/page-matrix-validator.js";
import {
  assertOwnerCredentialMutationBlocked,
  filterCredentialMutationTargets,
} from "../../lib/staging-owner-guard.js";

const ROOT = process.cwd();
const DEV_PORT = 3014;
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const TEST_DOMAIN = "staging-hcw.test";

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function loadEnv() {
  const staging = parseEnvFile(resolve(ROOT, ".env.staging.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.staging.bootstrap.local"));
  const env = { ...process.env, NODE_ENV: "development" };
  Object.assign(env, staging, bootstrap);
  env.NEXT_PUBLIC_SUPABASE_URL = staging.STAGING_SUPABASE_URL;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = staging.STAGING_SUPABASE_ANON_KEY;
  env.SUPABASE_SERVICE_ROLE_KEY = staging.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  env.IAM_DB = "true";
  env.IAM_API = "true";
  env.IAM_UI = "true";
  env.IAM_RLS = "false";
  return env;
}

async function loginDirect(env, email, password) {
  const anon = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return "";
  return `hc_access_token=${data.session.access_token}`;
}

async function httpGet(url, cookie = "") {
  const res = await fetch(url, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get("location") };
}

async function waitForServer(port) {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Server startup timeout");
}

function htmlLeaksAdminSecrets(html) {
  const patterns = [
    /iam\.manage/i,
    /super_admin/i,
    /admin-hub-tabs/i,
    /IAM \/ RBAC/i,
    /Grant Role/i,
    /hc_access_token/i,
  ];
  return patterns.filter((p) => p.test(html)).map((p) => String(p));
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const env = loadEnv();
  const sb = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const testPassword = crypto.randomBytes(16).toString("base64url");
  const report = {
    verdict: "NOT READY",
    ok: false,
    pageMatrix: validatePageMatrix(),
    ownerGuard: assertOwnerCredentialMutationBlocked({ email: env.IAM_OWNER_EMAIL }, env),
    httpDenial: {},
    denyWins: {},
  };

  for (const email of filterCredentialMutationTargets(
    [
      `iam-test-normal-user@${TEST_DOMAIN}`,
      `iam-test-support@${TEST_DOMAIN}`,
      `iam-test-accountant@${TEST_DOMAIN}`,
      `iam-test-news-editor@${TEST_DOMAIN}`,
      `iam-test-multi-ui@${TEST_DOMAIN}`,
    ],
    env
  )) {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = list?.users?.find((u) => u.email === email);
    if (user) await sb.auth.admin.updateUserById(user.id, { password: testPassword });
  }

  const dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(DEV_PORT);
    const base = `http://127.0.0.1:${DEV_PORT}`;

    const normalCookie = await loginDirect(env, `iam-test-normal-user@${TEST_DOMAIN}`, testPassword);
    const supportCookie = await loginDirect(env, `iam-test-support@${TEST_DOMAIN}`, testPassword);
    const accountantCookie = await loginDirect(env, `iam-test-accountant@${TEST_DOMAIN}`, testPassword);
    const newsCookie = await loginDirect(env, `iam-test-news-editor@${TEST_DOMAIN}`, testPassword);
    const multiCookie = await loginDirect(env, `iam-test-multi-ui@${TEST_DOMAIN}`, testPassword);
    const ownerCookie = await loginDirect(env, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);

    const cases = {
      normalAdmin: await httpGet(`${base}/admin`, normalCookie),
      normalIam: await httpGet(`${base}/admin/iam`, normalCookie),
      normalFinance: await httpGet(`${base}/admin/financial-center`, normalCookie),
      supportFinance: await httpGet(`${base}/admin/financial-center`, supportCookie),
      accountantIam: await httpGet(`${base}/admin/iam`, accountantCookie),
      newsAdminNews: await httpGet(`${base}/admin/news`, newsCookie),
      newsAdminIam: await httpGet(`${base}/admin/iam`, newsCookie),
    };

    report.httpDenial = Object.fromEntries(
      Object.entries(cases).map(([key, res]) => [
        key,
        {
          status: res.status,
          redirected: Boolean(res.location),
          location: res.location ? res.location.split("?")[0] : null,
          leaks: htmlLeaksAdminSecrets(res.text),
          hasAdminHub: /admin-hub|admin-iam-page|Admin Users/i.test(res.text),
        },
      ])
    );

    if (ownerCookie && multiCookie) {
      const denyRes = await fetch(`${base}/api/iam/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({
          action: "grant",
          email: `iam-test-multi-ui@${TEST_DOMAIN}`,
          permissionId: "news.publish",
          effect: "deny",
          reason: "staging deny-wins ui hardening test",
        }),
      });
      const denyJson = await denyRes.json().catch(() => ({}));
      const meRes = await fetch(`${base}/api/iam/me`, { headers: { Cookie: multiCookie } });
      const meJson = await meRes.json().catch(() => ({}));
      const publishRes = await fetch(`${base}/api/send-news`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: multiCookie },
        body: JSON.stringify({
          title: "fixture",
          actual: "1",
          forecast: "1",
          previous: "1",
          analysis: "fixture",
        }),
      });

      report.denyWins = {
        overrideStatus: denyRes.status,
        overrideSuccess: denyJson.success === true,
        hasPublishPermission: (meJson.permissions || []).includes("news.publish"),
        publishStatus: publishRes.status,
      };

      if (denyJson.override?.id) {
        await fetch(`${base}/api/iam/overrides`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: ownerCookie },
          body: JSON.stringify({
            action: "revoke",
            overrideId: denyJson.override.id,
            reason: "staging deny-wins cleanup",
          }),
        });
      }
    }

    const denialOk =
      report.httpDenial.normalAdmin.hasAdminHub === false &&
      report.httpDenial.normalIam.hasAdminHub === false &&
      report.httpDenial.normalFinance.hasAdminHub === false &&
      !report.httpDenial.supportFinance.hasAdminHub &&
      !report.httpDenial.accountantIam.hasAdminHub &&
      report.httpDenial.newsAdminNews.hasAdminHub === false &&
      !report.httpDenial.newsAdminIam.hasAdminHub &&
      [report.httpDenial.normalAdmin.status, report.httpDenial.normalIam.status, report.httpDenial.normalFinance.status].every(
        (s) => s === 200 || s === 403
      );

    report.ok =
      report.pageMatrix.ok &&
      report.ownerGuard.blocked === true &&
      denialOk &&
      report.denyWins.overrideSuccess === true &&
      report.denyWins.hasPublishPermission === false &&
      report.denyWins.publishStatus === 403;

    report.verdict = report.ok ? "PRE-RLS UI READY" : "NOT READY";
    const path = join(ARTIFACT_DIR, `staging-ui-hardening-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: report.verdict, ok: report.ok, artifact: path }, null, 2));
    process.exit(report.ok ? 0 : 1);
  } finally {
    if (!dev.killed) dev.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
