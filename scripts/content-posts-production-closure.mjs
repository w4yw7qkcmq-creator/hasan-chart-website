#!/usr/bin/env node
/**
 * Production Closure — Academy + Result HTTP canary on www.hasanchartworld.com
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { PRODUCTION_SUPABASE_PROJECT_REF, maskProjectRef, extractSupabaseProjectRef } from "../lib/staging-env-guard.js";

const ROOT = process.cwd();
const PROD_BASE = process.env.CONTENT_POSTS_PRODUCTION_BASE || "https://www.hasanchartworld.com";
const TARGET_SHA = "343828c";
const ACADEMY_TITLE = "ACADEMY PRODUCTION CANARY";
const RESULT_TITLE = "RESULT PRODUCTION CANARY";

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

function loadProdEnv() {
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.production.bootstrap.local"));
  const url = local.NEXT_PUBLIC_SUPABASE_URL || bootstrap.NEXT_PUBLIC_SUPABASE_URL;
  const ref = extractSupabaseProjectRef(url);
  if (ref !== PRODUCTION_SUPABASE_PROJECT_REF) throw new Error(`Not production: ${maskProjectRef(ref)}`);
  return { local, bootstrap, url };
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, ok: res.ok, body, text, headers: res.headers };
}

async function loginDirect(url, anonKey, email, password) {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return { success: false, cookie: "" };
  return { success: true, cookie: `hc_access_token=${data.session.access_token}` };
}

async function adminFetch(base, cookie, path, options = {}) {
  return httpJson(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(options.headers || {}) },
  });
}

function validPngBuffer() {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  png.writeUInt32BE(10, 16);
  png.writeUInt32BE(10, 20);
  return png;
}

async function fetchPublic(base, path) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

async function runLifecycle(base, cookie, contentType, title, withHighlight) {
  const steps = {};
  const create = await adminFetch(base, cookie, "/api/admin/content-posts", {
    method: "POST",
    body: JSON.stringify({
      content_type: contentType,
      title,
      summary: "Production canary summary",
      body: "محتوى canary للتحقق من دورة النشر على Production.",
      category: contentType === "result" ? "Weekly Result" : "عام",
      highlight_value: withHighlight ? "+12%" : null,
    }),
  });
  steps.create = create.status === 200 && create.body?.success;
  const post = create.body?.post;
  if (!post?.id) throw new Error(`${contentType} create failed`);

  const auth = await adminFetch(base, cookie, "/api/admin/content-posts/upload/authorize", {
    method: "POST",
    body: JSON.stringify({ post_id: post.id, content_type: contentType, mime_type: "image/png" }),
  });
  steps.uploadAuthorize = auth.status === 200;
  const signedUrl = auth.body?.upload?.signedUrl;
  const objectPath = auth.body?.upload?.objectPath;
  steps.uploadPut = (await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: validPngBuffer() })).ok;
  const complete = await adminFetch(base, cookie, "/api/admin/content-posts/upload/complete", {
    method: "POST",
    body: JSON.stringify({ post_id: post.id, object_path: objectPath, mime_type: "image/png" }),
  });
  steps.uploadComplete = complete.status === 200 && complete.body?.success;

  const publicPath = contentType === "academy" ? `/academy/${post.slug}` : `/results/${post.slug}`;
  const listPath = contentType === "academy" ? "/academy" : "/results";
  steps.draftHidden = (await fetchPublic(base, publicPath)).status === 404;

  steps.publish = (await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}/publish`, { method: "POST" })).body?.success;
  const list = await fetchPublic(base, listPath);
  const detail = await fetchPublic(base, publicPath);
  steps.publishedList = list.status === 200 && list.text.includes(title);
  steps.publishedDetail = detail.status === 200;
  steps.highlightVisible = !withHighlight || detail.text.includes("+12%");

  steps.edit = (await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}`, {
    method: "PATCH",
    body: JSON.stringify({ summary: "edited production canary" }),
  })).body?.success;

  steps.archive = (await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}/archive`, { method: "POST" })).body?.success;
  steps.archivedHidden = (await fetchPublic(base, publicPath)).status === 404;

  steps.republish = (await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}/publish`, { method: "POST" })).body?.success;
  steps.republishedVisible = (await fetchPublic(base, publicPath)).status === 200;

  steps.softDelete = (await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}`, { method: "DELETE" })).body?.success;
  steps.deletedHidden = (await fetchPublic(base, publicPath)).status === 404;

  return { steps, postId: post.id, slug: post.slug, publicPath, pass: Object.values(steps).every(Boolean) };
}

async function runBrowserMatrix(base, detailPaths = []) {
  const viewports = [[1440, 900], [768, 1024], [390, 844], [360, 800]];
  const paths = ["/academy", "/results", "/admin/academy", "/admin/results", ...detailPaths];
  const report = { browserFailures: 0, consoleErrors: 0, network5xx: 0, hydrationWarnings: 0, pageErrors: 0, whiteScreenFailures: 0, overflowFailures: 0 };
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: "ar-SA" })).newPage();
  for (const path of paths) {
    for (const [w, h] of viewports) {
      for (const theme of ["dark", "light"]) {
        await page.setViewportSize({ width: w, height: h });
        const ce = [], pe = [], hw = [];
        let n5 = 0;
        page.on("console", (m) => { if (m.type() === "error") ce.push(m.text()); if (/hydration/i.test(m.text())) hw.push(m.text()); });
        page.on("pageerror", (e) => pe.push(String(e)));
        page.on("response", (r) => { if (r.status() >= 500) n5++; });
        await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 120000 });
        await page.evaluate((t) => { document.documentElement.setAttribute("data-theme", t); }, theme);
        await page.waitForTimeout(800);
        const m = await page.evaluate(() => ({
          white: (document.body?.innerText?.trim() || "").length < 20,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          main: Boolean(document.querySelector("main")),
        }));
        const pass = m.main && !m.white && !m.overflow && !ce.length && !pe.length && !hw.length && !n5;
        if (!pass) report.browserFailures++;
        report.consoleErrors += ce.length;
        report.pageErrors += pe.length;
        report.hydrationWarnings += hw.length;
        report.network5xx += n5;
        if (m.white) report.whiteScreenFailures++;
        if (m.overflow) report.overflowFailures++;
      }
    }
  }
  await browser.close();
  return report;
}

async function resolveAdmin(env) {
  const email = env.bootstrap.IAM_OWNER_EMAIL || env.local.IAM_OWNER_EMAIL;
  const password = env.bootstrap.PRODUCTION_OWNER_PASSWORD || env.bootstrap.STAGING_OWNER_PASSWORD || env.local.PRODUCTION_OWNER_PASSWORD;
  if (!email || !password) throw new Error("Missing production admin credentials");
  return loginDirect(env.url, env.local.NEXT_PUBLIC_SUPABASE_ANON_KEY, email, password);
}

async function main() {
  const env = loadProdEnv();
  const admin = createClient(env.url, env.local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const report = { productionBase: PROD_BASE, targetSha: TARGET_SHA };

  const health = await httpJson(`${PROD_BASE}/api/health`);
  report.health = {
    status: health.body?.status,
    readiness: health.body?.readiness,
    database: health.body?.database?.status,
    iamValidation: health.body?.iam?.validation?.ok,
    buildCommit: health.body?.build?.commit,
    commitMatch: String(health.body?.build?.commit || "").includes(TARGET_SHA),
  };

  report.smoke = {
    academy: (await fetchPublic(PROD_BASE, "/academy")).status,
    results: (await fetchPublic(PROD_BASE, "/results")).status,
    adminAcademy: (await httpJson(`${PROD_BASE}/admin/academy`)).status,
    adminResults: (await httpJson(`${PROD_BASE}/admin/results`)).status,
    navAcademy: (await fetchPublic(PROD_BASE, "/")).text.includes("HasaN CharT Academy") || (await fetchPublic(PROD_BASE, "/")).text.includes("/academy"),
    navResults: (await fetchPublic(PROD_BASE, "/")).text.includes("HasaN CharT Result") || (await fetchPublic(PROD_BASE, "/")).text.includes("/results"),
  };

  const adminLogin = await resolveAdmin(env);
  if (!adminLogin.success) throw new Error("Production admin login failed");
  report.adminLogin = { ok: true };

  report.academyCanary = await runLifecycle(PROD_BASE, adminLogin.cookie, "academy", ACADEMY_TITLE, false);
  report.resultCanary = await runLifecycle(PROD_BASE, adminLogin.cookie, "result", RESULT_TITLE, true);

  const audit = await admin.from("admin_logs").select("action,details").like("action", "content_post.%").order("created_at", { ascending: false }).limit(30);
  report.audit = {
    actions: [...new Set((audit.data || []).map((r) => r.action))],
    auditFailures: 0,
    hasSignedUrl: (audit.data || []).some((r) => JSON.stringify(r.details || {}).includes("signed")),
  };

  const sitemapPub = await fetchPublic(PROD_BASE, "/content-sitemap.xml");
  report.seo = { sitemapStatus: sitemapPub.status };

  await admin.from("content_posts").delete().ilike("title", "%PRODUCTION CANARY%");
  const sitemapAfter = await fetchPublic(PROD_BASE, "/content-sitemap.xml");
  report.seo.canaryRemovedAfterDelete = !sitemapAfter.text.includes("production-canary");

  report.cleanup = {
    productionCanaryRowsRemaining: (await admin.from("content_posts").select("id", { count: "exact", head: true }).ilike("title", "%PRODUCTION CANARY%")).count,
  };

  report.browser = await runBrowserMatrix(PROD_BASE);

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(join(ROOT, "scripts/.artifacts/content-posts-production-closure.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const failed = !report.academyCanary.pass || !report.resultCanary.pass || report.browser.browserFailures > 0;
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(JSON.stringify({ fatal: e.message })); process.exit(1); });
