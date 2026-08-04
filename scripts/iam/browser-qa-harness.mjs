/**
 * Shared harness utilities for IAM browser QA (smoke + full).
 * No business logic — session bootstrap, server lifecycle, waits, allowlists.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
} from "../../lib/staging-env-guard.js";

export const DEV_PORT = 3019;
export const SESSION_BOOTSTRAP_MS = 8000;
export const PAGE_READY_MS = 8000;
export const PAGE_READY_ADMIN_MS = 15000;
export const SERVER_START_MS = 60000;
export const SMOKE_TOTAL_MS = 180000;
export const FULL_QA_TOTAL_MS = 720000;

export const NON_IAM_NETWORK_ALLOWLIST = [
  /\/api\/my-subscription-status/i,
  /\/api\/notification-hub\/feed/i,
];

export const NON_IAM_CONSOLE_ALLOWLIST = [
  /my-subscription-status/i,
  /notification-hub\/feed/i,
  /subscription_requests\.started_at/i,
];

export const SECRET_PATTERNS = [
  /hc_access_token/i,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
  /STAGING_OWNER_PASSWORD/i,
  /service_role/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];

export function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

export function loadEnv(root) {
  const staging = parseEnvFile(resolve(root, ".env.staging.local"));
  const bootstrap = parseEnvFile(resolve(root, ".env.staging.bootstrap.local"));
  const env = { ...process.env, NODE_ENV: "development" };
  Object.assign(env, staging, bootstrap);
  env.NEXT_PUBLIC_SUPABASE_URL = staging.STAGING_SUPABASE_URL;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = staging.STAGING_SUPABASE_ANON_KEY;
  env.SUPABASE_SERVICE_ROLE_KEY = staging.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  env.IAM_DB = "true";
  env.IAM_API = "true";
  env.IAM_UI = "true";
  env.IAM_RLS = "false";
  return { env, staging };
}

export function assertStagingOnly(env) {
  const ref = extractSupabaseProjectRef(env.STAGING_SUPABASE_URL || "");
  if (!ref) throw new Error("Missing staging Supabase project ref");
  if (ref === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Production Supabase ref blocked for browser QA");
  }
  return ref;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getPidsOnPort(port) {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: "utf8" }).trim();
    return out ? out.split("\n").map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isQaDevProcess(pid) {
  try {
    const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: "utf8" });
    return /next dev|next-server|npm run dev.*-p\s*3019|node.*3019/.test(cmd);
  } catch {
    return false;
  }
}

export async function ensurePortReady(port) {
  const killed = [];
  for (const pid of getPidsOnPort(port)) {
    if (isQaDevProcess(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        killed.push(pid);
      } catch {
        /* already gone */
      }
    } else {
      throw new Error(`Port ${port} occupied by non-QA process pid=${pid}; aborting`);
    }
  }
  if (killed.length) await sleep(1500);
  return killed;
}

export async function waitForServer(port, maxMs = SERVER_START_MS) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    await sleep(800);
  }
  throw new Error(`Server startup timeout on port ${port}`);
}

export function startDevServer(root, env, port = DEV_PORT) {
  const dev = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let devLog = "";
  dev.stdout?.on("data", (d) => {
    devLog += d.toString();
  });
  dev.stderr?.on("data", (d) => {
    devLog += d.toString();
  });
  dev.getLogTail = () => devLog.slice(-2000);
  return dev;
}

export async function stopDevServer(dev) {
  if (!dev || dev.killed) return;
  dev.kill("SIGTERM");
  await sleep(800);
  if (!dev.killed) {
    try {
      dev.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

export async function loginViaSupabase(context, env, base, email, password) {
  assertStagingOnly(env);
  const anon = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(`Supabase login failed for ${email}: ${error?.message || "no session"}`);
  }
  const cookieBase = { url: `${base}/`, httpOnly: true, secure: false, sameSite: "Lax" };
  await context.addCookies([
    { ...cookieBase, name: "hc_access_token", value: data.session.access_token },
    { ...cookieBase, name: "hc_refresh_token", value: data.session.refresh_token },
  ]);
}

export async function fetchMe(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/iam/me", { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  });
}

export async function verifyIamMe(page, { expectedIsAdmin, expectedRoles, timeoutMs = SESSION_BOOTSTRAP_MS }) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await fetchMe(page);
    if (last.status === 200) {
      let ok = true;
      if (expectedIsAdmin !== undefined && last.body?.isAdmin !== expectedIsAdmin) ok = false;
      if (ok && expectedRoles?.length) {
        const roles = last.body?.roles || [];
        ok = expectedRoles.some((r) => roles.includes(r));
      }
      if (ok) return { ok: true, me: last };
    }
    await sleep(350);
  }
  return { ok: false, me: last, error: "iam_me_timeout" };
}

export async function bootstrapSession(page, base, { expectedIsAdmin, expectedRoles, skipWarm = false }) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 10000 });

  await page
    .waitForResponse((res) => res.url().includes("/api/auth/session") && res.status() === 200, {
      timeout: SESSION_BOOTSTRAP_MS,
    })
    .catch(() => null);

  let boot = await verifyIamMe(page, { expectedIsAdmin, expectedRoles, timeoutMs: SESSION_BOOTSTRAP_MS });
  if (!boot.ok) {
    await sleep(300);
    boot = await verifyIamMe(page, { expectedIsAdmin, expectedRoles, timeoutMs: 4000 });
  }

  if (boot.ok && expectedIsAdmin && !skipWarm) {
    await page
      .waitForResponse((res) => res.url().includes("/api/iam/me") && res.status() === 200, {
        timeout: SESSION_BOOTSTRAP_MS,
      })
      .catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => null);
    await sleep(800);
    const warm = await warmAdminClient(page, base, 3);
    if (!warm.ok) {
      return { ...boot, ok: false, error: warm.error || "admin_warmup_failed", me: boot.me };
    }
  }

  return boot;
}

export async function warmAdminClient(page, base, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page
      .waitForResponse((res) => res.url().includes("/api/iam/me") && res.status() === 200, {
        timeout: 8000,
      })
      .catch(() => null);
    await sleep(1000 + i * 300);
    const checks = await pageChecks(page);
    if (!checks.has403Page && !page.url().includes("/403") && checks.hasAdminHub) {
      return { ok: true, checks, warmed: true };
    }
    if (!checks.has403Page && !page.url().includes("/403")) {
      return { ok: true, checks, warmed: true };
    }
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 10000 });
    await verifyIamMe(page, { expectedIsAdmin: true, timeoutMs: 5000 });
    await sleep(900);
  }
  return { ok: false, error: "admin_warmup_failed" };
}

export async function waitForSpinnerHidden(page, timeoutMs = PAGE_READY_MS) {
  try {
    const loading = page.locator(".admin-access-loading");
    if (await loading.count()) {
      await loading.waitFor({ state: "hidden", timeout: timeoutMs });
    }
  } catch {
    await page
      .waitForFunction(() => !document.querySelector(".admin-access-loading"), { timeout: timeoutMs })
      .catch(() => null);
  }
}

function matchesPageReady(checks, options = {}) {
  if (checks.hasSpinner) return false;
  if (options.expectForbidden) {
    return checks.hasForbidden && !checks.hasAdminHub && !checks.has403Page;
  }
  if (checks.has403Page) return false;
  if (options.expectNews) {
    return !checks.hasForbidden && (checks.hasNewsPage || checks.publishBtn);
  }
  if (options.expectIam) {
    return !checks.hasForbidden && checks.hasIamPage;
  }
  if (options.expectAdminHub) {
    return checks.hasAdminHub && !checks.hasForbidden;
  }
  return checks.hasAdminHub || checks.hasForbidden || checks.hasNewsPage || checks.hasIamPage;
}

export async function waitForPageReady(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? PAGE_READY_MS;
  const start = Date.now();

  await page
    .waitForResponse((res) => res.url().includes("/api/auth/session") && res.status() === 200, {
      timeout: Math.min(timeoutMs, 6000),
    })
    .catch(() => null);

  await page
    .waitForResponse((res) => res.url().includes("/api/iam/me") && res.status() === 200, {
      timeout: timeoutMs,
    })
    .catch(() => null);

  if (options.expectIam) {
    await page
      .waitForResponse((res) => res.url().includes("/api/iam/roles") && res.status() === 200, {
        timeout: Math.min(timeoutMs, 10000),
      })
      .catch(() => null);
  }

  await waitForSpinnerHidden(page, timeoutMs);

  while (Date.now() - start < timeoutMs) {
    const checks = await pageChecks(page);
    if (matchesPageReady(checks, options)) {
      return { ok: true, checks };
    }
    await sleep(200);
  }

  const checks = await pageChecks(page);
  return {
    ok: matchesPageReady(checks, options),
    checks,
    error: matchesPageReady(checks, options) ? null : "page_ready_timeout",
  };
}

export async function gotoAndWait(page, base, path, readyOptions) {
  const timeoutMs =
    readyOptions.timeoutMs ??
    (readyOptions.expectAdminHub || readyOptions.expectIam || readyOptions.expectNews
      ? PAGE_READY_ADMIN_MS
      : PAGE_READY_MS);
  const stepStarted = Date.now();
  const max403Recovery = readyOptions.expectForbidden ? 1 : 4;

  for (let attempt = 0; attempt < max403Recovery; attempt += 1) {
    if (Date.now() - stepStarted > timeoutMs + 12000) break;

    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 15000 });

    await page
      .waitForResponse((res) => res.url().includes("/api/iam/me") && res.status() === 200, {
        timeout: 10000,
      })
      .catch(() => null);

    await sleep(800 + attempt * 500);

    let checks = await pageChecks(page);
    const on403 = checks.has403Page || page.url().includes("/403");
    if (!on403) {
      const remaining = Math.max(3000, timeoutMs - (Date.now() - stepStarted));
      const ready = await waitForPageReady(page, { ...readyOptions, timeoutMs: remaining });
      if (ready.ok) return ready;
      checks = ready.checks || checks;
      if (!checks.has403Page && !page.url().includes("/403")) {
        return ready;
      }
    }

    if (readyOptions.expectForbidden) {
      return waitForPageReady(page, { ...readyOptions, timeoutMs: 8000 });
    }

    await verifyIamMe(page, {
      expectedIsAdmin: true,
      timeoutMs: Math.min(6000, timeoutMs),
    });
  }

  const remaining = Math.max(2000, timeoutMs - (Date.now() - stepStarted));
  return waitForPageReady(page, { ...readyOptions, timeoutMs: remaining });
}

export function attachPageObservers(page, report) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/favicon|404.*\.map/i.test(t)) return;
    if (NON_IAM_CONSOLE_ALLOWLIST.some((p) => p.test(t))) return;
    if (isIamRelatedConsoleError(t)) {
      report.consoleErrors.push(t.slice(0, 200));
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    if (NON_IAM_NETWORK_ALLOWLIST.some((p) => p.test(url))) return;
    if (
      (url.includes("/api/admin") || url.includes("/api/iam")) &&
      res.status() >= 400 &&
      res.status() !== 403
    ) {
      report.networkFailures.push({ url: url.split("?")[0], status: res.status() });
    }
  });
}

function isIamRelatedConsoleError(text) {
  if (/403|forbidden/i.test(text) && /admin|iam/i.test(text)) return true;
  if (/\/api\/iam|\/admin/i.test(text)) return true;
  if (/AdminAccessGate|PermissionGate|admin-hub/i.test(text)) return true;
  return false;
}

export function scanSecrets(text) {
  return SECRET_PATTERNS.filter((p) => p.test(text)).map((p) => String(p));
}

export async function pageChecks(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector(".admin-hub-shell") ||
      document.querySelector(".admin-forbidden-page") ||
      document.querySelector(".admin-standalone-page") ||
      document.body;
    const adminLinks = [...root.querySelectorAll("a[href], button")];
    const hrefText = (el) =>
      `${el.textContent || ""} ${el.getAttribute("href") || ""} ${el.getAttribute("title") || ""}`;
    const hasAdminHub = Boolean(
      document.querySelector(".admin-hub-shell") ||
        document.querySelector(".admin-iam-page") ||
        document.querySelector(".admin-user-management") ||
        document.querySelector(".admin-hub-tile-grid")
    );
    const hasForbidden = Boolean(document.querySelector(".admin-forbidden-page"));
    const hasSpinner = Boolean(document.querySelector(".admin-access-loading"));
    const dir = document.documentElement.getAttribute("dir");
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
    const publishBtn = [...root.querySelectorAll("button")].some((b) =>
      /نشر الخبر/i.test(b.textContent || "")
    );
    const financeNav = adminLinks.some((el) => /\/admin\/financial-center|المركز المالي/i.test(hrefText(el)));
    const iamNav = adminLinks.some((el) => /\/admin\/iam|IAM \/ RBAC/i.test(hrefText(el)));
    const newsNav = adminLinks.some((el) => /\/admin\/news|إدارة الأخبار/i.test(hrefText(el)));
    const subsNav = [...root.querySelectorAll(".admin-hub-tile__title, .admin-hub-tile h3")].some((el) =>
      /^الاشتراكات$/u.test((el.textContent || "").trim())
    );
    const subsManageActions = [...root.querySelectorAll("button")].some((b) =>
      /(قبول|رفض|تفعيل|activate|reject).*اشتراك/i.test(b.textContent || "")
    );
    const hasNewsPage = Boolean(document.querySelector(".admin-news-page__title"));
    const hasIamPage = Boolean(document.querySelector(".admin-iam-page"));
    const has403Page = /403\s*[—-]\s*غير مصرح/u.test(document.body?.innerText || "");
    return {
      hasAdminHub,
      hasForbidden,
      hasSpinner,
      has403Page,
      hasNewsPage,
      hasIamPage,
      dir,
      overflowX,
      publishBtn,
      financeNav,
      iamNav,
      newsNav,
      subsNav,
      subsManageActions,
      htmlSampleLen: root.innerHTML.length,
    };
  });
}

export function navFromPermissions(permissions) {
  const set = new Set(permissions || []);
  return {
    financeNav: set.has("finance.read"),
    iamNav: set.has("iam.read"),
    newsNav: set.has("news.read") || set.has("news.manage"),
    /** Nav tile visibility — matches admin-hub-config (subscriptions.manage). */
    subsNav: set.has("subscriptions.manage"),
    subsRead: set.has("subscriptions.read"),
    subsManage: set.has("subscriptions.manage"),
    analysisNav: set.has("analysis.read") || set.has("analysis.manage"),
  };
}

export async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* ignore */
    }
  }, theme);
}

export function writeReport(path, report) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2));
}

export function envMeta(env) {
  const stagingRef = maskProjectRef(extractSupabaseProjectRef(env.STAGING_SUPABASE_URL || ""));
  const productionRef = maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF);
  return { stagingRef, productionRef };
}
