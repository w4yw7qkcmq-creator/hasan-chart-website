#!/usr/bin/env node
/**
 * Production authenticated smoke — overview recent withdrawals identity.
 * Read-only. Run: node scripts/partner-center/overview-withdrawal-production-smoke.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadE2eEnv } from "../e2e/env.mjs";
import { HttpClient } from "../e2e/http.mjs";

const BASE = "https://www.hasanchartworld.com";
const EXPECTED_COMMIT_PREFIX = process.argv[2] || "f28e0d6";

const report = {
  pass: [],
  fail: [],
  blocked: [],
  counts: { r429: 0, r5xx: 0 },
};

function pass(name, detail = "") {
  report.pass.push({ name, detail });
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail = "") {
  report.fail.push({ name, detail });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}
function blocked(name, detail = "") {
  report.blocked.push({ name, detail });
  console.log(`BLOCKED ${name}${detail ? `: ${detail}` : ""}`);
}

function trackStatus(status) {
  if (status === 429) report.counts.r429 += 1;
  if (status >= 500) report.counts.r5xx += 1;
}

async function adminClient(env) {
  const client = new HttpClient(BASE);
  try {
    await client.login(env.adminEmail, env.adminPass);
    return client;
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error("admin_login_unavailable");
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({
      email: env.adminEmail,
      password: env.adminPass,
    });
    if (error || !data?.session?.access_token) throw new Error("admin_login_failed");
    client.jar.map.set("hc_access_token", data.session.access_token);
    client.jar.map.set("hc_refresh_token", data.session.refresh_token);
    return client;
  }
}

function validateWithdrawalRow(row, index) {
  const issues = [];
  const partner = row?.partner || {};
  const name = String(partner.displayName || "").trim();
  const email = String(partner.email || "").trim();

  if (!name || name === "—") issues.push("missing displayName");
  if (!email) issues.push("missing email");
  if (email.includes("undefined") || email.includes("null")) issues.push("invalid email token");
  if (/^[0-9a-f-]{20,}$/i.test(name)) issues.push("uuid-like name");
  if (/^[0-9a-f-]{20,}$/i.test(email)) issues.push("uuid-like email");
  if (row.amount == null) issues.push("missing amount");
  if (!row.currency) issues.push("missing currency");
  if (!row.network) issues.push("missing network");
  if (!row.status) issues.push("missing status");
  if (!row.createdAt) issues.push("missing createdAt");
  if (email.includes("***")) issues.push("masked email in admin view");

  return { ok: !issues.length, issues, name, email };
}

async function financialBaseline(supabase) {
  const [commissions, ledger, withdrawals] = await Promise.all([
    supabase.from("partner_commissions").select("id", { count: "exact", head: true }),
    supabase.from("partner_financial_ledger_entries").select("id", { count: "exact", head: true }),
    supabase.from("partner_withdrawals").select("id", { count: "exact", head: true }),
  ]);
  return {
    commissions: commissions.count ?? 0,
    ledger: ledger.count ?? 0,
    withdrawals: withdrawals.count ?? 0,
  };
}

async function main() {
  const env = loadE2eEnv();
  const anon = new HttpClient(BASE);

  const health = await anon.json("/api/health");
  trackStatus(health.res.status);
  const commit = String(health.data?.build?.commit || "");
  if (health.res.status !== 200 || health.data?.status !== "ok" || health.data?.readiness !== "ready") {
    fail("health", `${health.res.status}`);
  } else if (!commit.startsWith(EXPECTED_COMMIT_PREFIX)) {
    fail("health_commit", commit.slice(0, 12));
  } else {
    pass("health", `${commit.slice(0, 12)} ok/ready/db=${health.data?.database?.status}`);
  }

  if (!env.hasAdminCredentials) {
    blocked("admin_auth", "E2E_ADMIN_EMAIL/PASS missing");
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  let before = null;
  let after = null;
  if (env.hasSupabaseAdmin) {
    const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false },
    });
    before = await financialBaseline(supabase);
  } else {
    blocked("financial_baseline", "SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const client = await adminClient(env);
  pass("admin_login", "ok");

  const analytics = await client.json("/api/admin/partner-analytics");
  trackStatus(analytics.res.status);
  if (analytics.res.status === 429) fail("analytics_429", "unexpected");
  if (analytics.res.status >= 500) fail("analytics_5xx", String(analytics.res.status));

  const rows = analytics.data?.analytics?.latestWithdrawals || [];
  if (analytics.res.status !== 200 || !analytics.data?.success) {
    fail("analytics_api", `${analytics.res.status} ${analytics.data?.error || ""}`);
  } else if (!rows.length) {
    pass("analytics_rows", "empty list acceptable");
  } else {
    pass("analytics_rows", String(rows.length));
    rows.forEach((row, index) => {
      const result = validateWithdrawalRow(row, index);
      if (result.ok) {
        pass(`withdrawal_row_${index + 1}_api`, `${result.name} | ${result.email}`);
      } else {
        fail(`withdrawal_row_${index + 1}_api`, result.issues.join(", "));
      }
    });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e.message)));

  for (const [name, value] of client.jar.map.entries()) {
    await context.addCookies([
      {
        name,
        value,
        url: `${BASE}/`,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  }

  const nav = await page.goto(`${BASE}/admin/partners?tab=overview`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  trackStatus(nav?.status() || 0);
  if (!nav || nav.status() >= 500) fail("overview_page_status", String(nav?.status()));
  else if (nav.status() === 429) fail("overview_page_429", "unexpected");
  else pass("overview_page_status", String(nav.status()));

  await page.waitForSelector(".pa-withdrawal-list, .pa-withdrawal-row, .pa-nested-card", {
    timeout: 25000,
  }).catch(() => null);

  const domRows = await page.locator(".pa-withdrawal-row").evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: node.querySelector(".pa-withdrawal-row__owner")?.textContent?.trim() || "",
      email: node.querySelector(".pa-withdrawal-row__email")?.textContent?.trim() || "",
      amount: node.querySelector(".pa-withdrawal-row__amount")?.textContent?.trim() || "",
      date: node.querySelector(".pa-withdrawal-row__date")?.textContent?.trim() || "",
      status: node.querySelector(".admin-badge")?.textContent?.trim() || "",
      emailDir: node.querySelector(".pa-withdrawal-row__email")?.getAttribute("dir") || "",
    }))
  );

  if (!rows.length && domRows.length === 0) {
    pass("overview_visual_rows", "empty state");
  } else if (domRows.length !== rows.length) {
    fail("overview_visual_count", `api=${rows.length} dom=${domRows.length}`);
  } else {
    pass("overview_visual_count", String(domRows.length));
    domRows.forEach((row, index) => {
      const apiRow = rows[index];
      const issues = [];
      if (!row.name) issues.push("missing name");
      if (!row.email) issues.push("missing email");
      if (!row.amount) issues.push("missing amount");
      if (!row.date) issues.push("missing date");
      if (!row.status) issues.push("missing status");
      if (row.emailDir !== "ltr") issues.push("email not LTR");
      if (row.email.includes("***")) issues.push("masked email");
      if (apiRow?.partner?.email && row.email !== apiRow.partner.email) {
        issues.push("email mismatch vs API");
      }
      if (apiRow?.partner?.displayName && row.name !== apiRow.partner.displayName) {
        issues.push("name mismatch vs API");
      }
      if (issues.length) fail(`withdrawal_row_${index + 1}_visual`, issues.join(", "));
      else pass(`withdrawal_row_${index + 1}_visual`, `${row.name} | ${row.email} | ${row.status}`);
    });
  }

  const critical = consoleErrors.filter((e) => !/ResizeObserver|favicon|hydration/i.test(e));
  if (!critical.length) pass("overview_console", "clean");
  else fail("overview_console", critical.slice(0, 2).join(" | "));

  await browser.close();

  if (env.hasSupabaseAdmin) {
    const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false },
    });
    after = await financialBaseline(supabase);
    if (JSON.stringify(before) === JSON.stringify(after)) {
      pass("financial_delta", JSON.stringify(after));
    } else {
      fail("financial_delta", `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    }
  }

  if (report.counts.r429) fail("unexpected_429_total", String(report.counts.r429));
  else pass("unexpected_429_total", "0");

  if (report.counts.r5xx) fail("unexpected_5xx_total", String(report.counts.r5xx));
  else pass("unexpected_5xx_total", "0");

  console.log("\nSUMMARY", JSON.stringify({
    commit: commit.slice(0, 12),
    pass: report.pass.length,
    fail: report.fail.length,
    blocked: report.blocked.length,
    counts: report.counts,
    fails: report.fail,
  }, null, 2));

  process.exit(report.fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error("SMOKE_CRASH", e.message);
  process.exit(1);
});
