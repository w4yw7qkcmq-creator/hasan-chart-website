#!/usr/bin/env node
/** Parallel burst QA for admin read-only GETs */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CookieJar } from "../e2e/http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const BASE = process.env.E2E_BASE_URL || "https://www.hasanchartworld.com";

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

const PATHS = [
  "/api/admin/email-campaigns",
  "/api/admin/email-outbox",
  "/api/admin/email-analytics",
  "/api/admin/email-campaigns/audience-counts",
  "/api/admin/user-management",
];

async function login(jar) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASS }),
  });
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  if (res.status !== 200) throw new Error("login failed");
}

async function timed(path, jar) {
  const start = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: jar.header() } });
  return { path, status: res.status, ttfb: Math.round(performance.now() - start) };
}

const jar = new CookieJar();
await login(jar);
const wallStart = performance.now();
const results = await Promise.all(PATHS.map((p) => timed(p, jar)));
const wallMs = Math.round(performance.now() - wallStart);
console.log(JSON.stringify({ wallMs, results, errors: results.filter((r) => r.status !== 200).length }, null, 2));
