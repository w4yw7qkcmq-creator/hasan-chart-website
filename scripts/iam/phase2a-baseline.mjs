#!/usr/bin/env node
/**
 * IAM Phase 2A — production/staging admin API timing baseline.
 * Usage: node scripts/iam/phase2a-baseline.mjs [--runs=3]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CookieJar } from "../e2e/http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(ROOT, ".env.e2e.local"));

const BASE = process.env.E2E_BASE_URL || "https://www.hasanchartworld.com";
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASS = process.env.E2E_ADMIN_PASS;
const RUNS = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] || 3);

const ENDPOINTS = [
  "/api/admin/email-campaigns",
  "/api/admin/email-outbox",
  "/api/admin/email-analytics",
  "/api/admin/email-campaigns/audience-counts",
  "/api/admin/user-management",
];

async function timedFetch(url, jar) {
  const start = performance.now();
  const res = await fetch(url, {
    headers: { Cookie: jar.header(), "User-Agent": "IAM-Phase2A-Baseline/1.0" },
  });
  const ttfb = performance.now() - start;
  const body = await res.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    // ignore
  }
  return { status: res.status, ttfb, json };
}

async function login(jar) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "IAM-Phase2A-Baseline/1.0" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const data = await res.json();
  if (res.status !== 200 || !data?.success) {
    throw new Error(`login failed: ${res.status} ${data?.error || ""}`);
  }
}

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

async function main() {
  if (!EMAIL || !PASS) {
    console.error("Missing E2E_ADMIN_EMAIL / E2E_ADMIN_PASS in .env.e2e.local");
    process.exit(1);
  }

  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();
  console.log(JSON.stringify({ phase: "baseline_meta", base: BASE, healthCommit: health?.build?.commit, runs: RUNS }, null, 2));

  const jar = new CookieJar();
  await login(jar);

  const results = {};

  for (const path of ENDPOINTS) {
    const timings = [];
    for (let i = 0; i < RUNS; i += 1) {
      const { status, ttfb } = await timedFetch(`${BASE}${path}`, jar);
      timings.push({ run: i + 1, status, ttfb: Math.round(ttfb) });
      await new Promise((r) => setTimeout(r, 300));
    }
    const warm = timings.slice(1);
    results[path] = {
      runs: timings,
      warmAvgTtfb: avg(warm.map((t) => t.ttfb)),
      allAvgTtfb: avg(timings.map((t) => t.ttfb)),
    };
  }

  console.log(JSON.stringify({ phase: "baseline_results", results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
