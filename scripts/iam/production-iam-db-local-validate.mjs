#!/usr/bin/env node
/**
 * Local production-DB IAM_DB validation — single owner login, no hammering.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { PRODUCTION_SUPABASE_PROJECT_REF, extractSupabaseProjectRef } from "../../lib/production-env-guard.js";

const ROOT = process.cwd();
const DEV_PORT = 3015;

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = val;
  }
  return out;
}

function loadEnv() {
  return {
    ...process.env,
    NODE_ENV: "development",
    IAM_DB: "true",
    IAM_API: "false",
    IAM_UI: "false",
    IAM_RLS: "false",
    ...parseEnvFile(resolve(ROOT, ".env.local")),
    ...parseEnvFile(resolve(ROOT, ".env.production.bootstrap.local")),
  };
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const env = loadEnv();
  if (extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL) !== PRODUCTION_SUPABASE_PROJECT_REF) {
    console.error(JSON.stringify({ error: "not_production_ref" }));
    process.exit(1);
  }

  const dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const start = Date.now();
    while (Date.now() - start < 120000) {
      try {
        const h = await httpJson(`http://127.0.0.1:${DEV_PORT}/api/health`);
        if (h.body?.status === "ok") break;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    const base = `http://127.0.0.1:${DEV_PORT}`;
    const login = await httpJson(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.IAM_OWNER_EMAIL, password: env.PRODUCTION_OWNER_PASSWORD }),
    });

    const cookies = login.body?.success ? await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.IAM_OWNER_EMAIL, password: env.PRODUCTION_OWNER_PASSWORD }),
    }).then((r) => r.headers.getSetCookie?.() || []) : [];

    let cookie = "";
    for (const c of cookies) {
      const m = String(c).match(/hc_access_token=([^;]+)/);
      if (m) cookie = m[1];
    }

    const iamHealth = await httpJson(`${base}/api/iam/health`, {
      headers: { Cookie: `hc_access_token=${cookie}` },
    });
    const iamMe = await httpJson(`${base}/api/iam/me`, {
      headers: { Cookie: `hc_access_token=${cookie}` },
    });

    const report = iamHealth.body?.health || {};
    const me = iamMe.body?.iam || iamMe.body?.data?.iam || {};

    console.log(
      JSON.stringify(
        {
          localValidation: true,
          iamHealth: {
            flags: report.flags,
            assignmentsCount: report.assignmentsCount,
            superAdminCount: report.superAdminCount,
            bootstrapCompleted: report.bootstrapCompleted,
            schemaConfigured: report.schemaConfigured,
            misconfigured: report.flagValidation?.misconfigured,
            status: report.status,
          },
          ownerMe: {
            isAdmin: me.isAdmin,
            roles: me.roles,
            hasIamManage: (me.permissionsList || []).includes("iam.manage"),
            source: me.source,
            featureFlags: me.featureFlags,
          },
        },
        null,
        2
      )
    );
  } finally {
    dev.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
