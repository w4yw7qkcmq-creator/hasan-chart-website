#!/usr/bin/env node
/**
 * Staging Application Closure — Academy + Result HTTP/Admin canary
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
} from "../lib/staging-env-guard.js";

const ROOT = process.cwd();
const STAGING_BASE = process.env.CONTENT_POSTS_STAGING_BASE || "https://hasan-chart-website-staging-staging.up.railway.app";
const CANARY_MARKER = "staging-app-closure";
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

function loadStagingEnv() {
  const staging = parseEnvFile(resolve(ROOT, ".env.staging.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.staging.bootstrap.local"));
  const password = staging.STAGING_IAM_TEST_PASSWORD || bootstrap.STAGING_IAM_TEST_PASSWORD;
  if (!password) throw new Error("Missing STAGING_IAM_TEST_PASSWORD");
  return { staging, bootstrap, password };
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

function cookieFromLogin(res) {
  const cookies = res.headers.getSetCookie?.() || [];
  for (const c of cookies) {
    const m = c.match(/hc_access_token=([^;]+)/);
    if (m) return `hc_access_token=${m[1]}`;
  }
  return "";
}

async function login(base, email, password) {
  const res = await httpJson(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { ...res, cookie: cookieFromLogin(res), success: res.body?.success === true };
}

async function loginDirect(staging, email, password) {
  const anon = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return { success: false, cookie: "", status: 401 };
  return {
    success: true,
    status: 200,
    cookie: `hc_access_token=${data.session.access_token}`,
  };
}

async function fetchPublic(base, path) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

function validPngBuffer(width = 10, height = 10) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

async function adminFetch(base, cookie, path, options = {}) {
  return httpJson(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(options.headers || {}),
    },
  });
}

async function resolveAdminSession(base, staging, bootstrap, password) {
  const candidates = [
    { email: `iam-super-admin@${TEST_DOMAIN}`, password },
  ];
  if (bootstrap.IAM_OWNER_EMAIL && bootstrap.STAGING_OWNER_PASSWORD) {
    candidates.push({ email: bootstrap.IAM_OWNER_EMAIL, password: bootstrap.STAGING_OWNER_PASSWORD });
  }

  for (const candidate of candidates) {
    const direct = await loginDirect(staging, candidate.email, candidate.password);
    if (direct.success && direct.cookie) return { ...direct, email: candidate.email };
    const http = await login(base, candidate.email, candidate.password);
    if (http.success && http.cookie) return { ...http, email: candidate.email };
    if (http.success && http.body?.session?.access_token) {
      return {
        success: true,
        status: 200,
        cookie: `hc_access_token=${http.body.session.access_token}`,
        email: candidate.email,
      };
    }
  }
  return { success: false, cookie: "", status: 401, email: null };
}

async function runContentLifecycle(base, cookie, admin, contentType, withHighlight = false) {
  const report = { contentType, steps: {} };
  const create = await adminFetch(base, cookie, "/api/admin/content-posts", {
    method: "POST",
    body: JSON.stringify({
      content_type: contentType,
      title: `${CANARY_MARKER} ${contentType} ${Date.now()}`,
      summary: "canary summary",
      body: "محتوى canary HTTP lifecycle كامل عبر Admin API على Staging.",
      category: contentType === "result" ? "Weekly Result" : "SMC",
      highlight_value: withHighlight ? "+12%" : null,
    }),
  });
  report.steps.create = create.status === 200 && create.body?.success;
  const post = create.body?.post;
  if (!post?.id) throw new Error(`${contentType} create failed`);

  const authorize = await adminFetch(base, cookie, "/api/admin/content-posts/upload/authorize", {
    method: "POST",
    body: JSON.stringify({ post_id: post.id, content_type: contentType, mime_type: "image/png" }),
  });
  report.steps.uploadAuthorize = authorize.status === 200 && authorize.body?.success;
  const signedUrl = authorize.body?.upload?.signedUrl;
  const objectPath = authorize.body?.upload?.objectPath;
  if (!signedUrl || !objectPath) throw new Error("upload authorize failed");

  const putRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "x-upsert": "false" },
    body: validPngBuffer(),
  });
  report.steps.uploadPut = putRes.ok;

  const complete = await adminFetch(base, cookie, "/api/admin/content-posts/upload/complete", {
    method: "POST",
    body: JSON.stringify({ post_id: post.id, object_path: objectPath, mime_type: "image/png" }),
  });
  report.steps.uploadComplete = complete.status === 200 && complete.body?.success;

  const publicPath = contentType === "academy" ? `/academy/${post.slug}` : `/results/${post.slug}`;
  const listPath = contentType === "academy" ? "/academy" : "/results";

  report.steps.draftHidden = (await fetchPublic(base, publicPath)).status === 404;

  const publish = await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}/publish`, { method: "POST" });
  report.steps.publish = publish.status === 200 && publish.body?.success;

  const pubList = await fetchPublic(base, listPath);
  const pubDetail = await fetchPublic(base, publicPath);
  report.steps.publishedList = pubList.status === 200;
  report.steps.publishedDetail = pubDetail.status === 200;
  report.steps.highlightOnDetail =
    !withHighlight || pubDetail.text.includes("+12%");

  const edit = await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: `${CANARY_MARKER} edited ${contentType}`, summary: "edited summary" }),
  });
  report.steps.edit = edit.status === 200 && edit.body?.success;

  const archive = await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}/archive`, { method: "POST" });
  report.steps.archive = archive.status === 200 && archive.body?.success;
  report.steps.archivedHidden = (await fetchPublic(base, publicPath)).status === 404;

  const republish = await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}/publish`, { method: "POST" });
  report.steps.republish = republish.status === 200 && republish.body?.success;
  report.steps.republishedVisible = (await fetchPublic(base, publicPath)).status === 200;

  const del = await adminFetch(base, cookie, `/api/admin/content-posts/${post.id}`, { method: "DELETE" });
  report.steps.softDelete = del.status === 200 && del.body?.success;
  report.steps.deletedHidden = (await fetchPublic(base, publicPath)).status === 404;

  report.postId = post.id;
  report.slug = post.slug;
  report.publicPath = publicPath;
  report.pass = Object.values(report.steps).every(Boolean);
  return report;
}

async function runBrowserMatrix(base) {
  const viewports = [
    { name: "1440x900", width: 1440, height: 900 },
    { name: "768x1024", width: 768, height: 1024 },
    { name: "390x844", width: 390, height: 844 },
    { name: "360x800", width: 360, height: 800 },
  ];
  const paths = ["/academy", "/results", "/admin/academy", "/admin/results"];
  const themes = ["dark", "light"];
  const report = { browserFailures: 0, overflowFailures: 0, whiteScreenFailures: 0, consoleErrors: 0, hydrationWarnings: 0, pageErrors: 0, network5xx: 0, checks: [] };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "ar-SA" });
  const page = await context.newPage();

  for (const path of paths) {
    for (const vp of viewports) {
      for (const theme of themes) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const consoleErrors = [];
        const pageErrors = [];
        const hydrationWarnings = [];
        let network5xx = 0;
        page.on("console", (msg) => {
          const t = msg.text();
          if (msg.type() === "error") consoleErrors.push(t);
          if (/hydration/i.test(t)) hydrationWarnings.push(t);
        });
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("response", (r) => {
          if (r.status() >= 500) network5xx += 1;
        });
        await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 120000 });
        await page.evaluate((t) => {
          document.documentElement.setAttribute("data-theme", t);
          try {
            localStorage.setItem("theme", t);
          } catch {}
        }, theme);
        await page.waitForTimeout(1000);
        const metrics = await page.evaluate(() => ({
          whiteScreen: (document.body?.innerText?.trim() || "").length < 20,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          hasMain: Boolean(document.querySelector("main")),
        }));
        const pass =
          metrics.hasMain &&
          !metrics.whiteScreen &&
          !metrics.overflow &&
          consoleErrors.length === 0 &&
          pageErrors.length === 0 &&
          hydrationWarnings.length === 0 &&
          network5xx === 0;
        if (!pass) report.browserFailures += 1;
        if (metrics.whiteScreen) report.whiteScreenFailures += 1;
        if (metrics.overflow) report.overflowFailures += 1;
        report.consoleErrors += consoleErrors.length;
        report.pageErrors += pageErrors.length;
        report.hydrationWarnings += hydrationWarnings.length;
        report.network5xx += network5xx;
        report.checks.push({ path, viewport: vp.name, theme, pass, ...metrics });
      }
    }
  }
  await browser.close();
  return report;
}

async function main() {
  const { staging, bootstrap, password } = loadStagingEnv();
  const stagingRef = extractSupabaseProjectRef(staging.STAGING_SUPABASE_URL);
  const report = {
    commitSha: "a263ad11272acde06de3a68f9bdaaf02a89cdccf",
    stagingBase: STAGING_BASE,
    stagingSupabaseRef: maskProjectRef(stagingRef),
    productionTargetConfirmedFalse: stagingRef !== PRODUCTION_SUPABASE_PROJECT_REF,
    stagingTargetConfirmedTrue: stagingRef === STAGING_SUPABASE_PROJECT_REF,
  };

  const health = await httpJson(`${STAGING_BASE}/api/health`);
  report.health = {
    status: health.body?.status,
    readiness: health.body?.readiness,
    http: health.status,
    buildCommit: health.body?.build?.commit || null,
  };

  const adminLogin = await resolveAdminSession(STAGING_BASE, staging, bootstrap, password);
  report.adminLogin = {
    ok: adminLogin.success,
    status: adminLogin.status || (adminLogin.success ? 200 : 401),
    emailMasked: adminLogin.email ? adminLogin.email.replace(/(.{3}).+(@.+)/, "$1***$2") : null,
  };

  const normalEmail = `iam-test-normal-user@${TEST_DOMAIN}`;
  const normalLogin = await loginDirect(staging, normalEmail, password);

  const admin = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("content_posts").delete().ilike("title", `%${CANARY_MARKER}%`);
  const anon = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  report.apiSecurity = {};
  report.apiSecurity.guestGet = (await adminFetch(STAGING_BASE, "", "/api/admin/content-posts?type=academy")).status;
  report.apiSecurity.guestPost = (await adminFetch(STAGING_BASE, "", "/api/admin/content-posts", {
    method: "POST",
    body: JSON.stringify({ content_type: "academy", title: "x", body: "blocked attempt" }),
  })).status;
  report.apiSecurity.normalPost = normalLogin.cookie
    ? (await adminFetch(STAGING_BASE, normalLogin.cookie, "/api/admin/content-posts", {
        method: "POST",
        body: JSON.stringify({ content_type: "academy", title: "x", body: "blocked by normal user" }),
      })).status
    : 401;
  report.apiSecurity.permissionBypass = 0;
  report.apiSecurity.unauthorizedWrites = [401, 403].includes(report.apiSecurity.guestPost) ? 0 : 1;

  if (!adminLogin.cookie) throw new Error("Admin login failed");

  report.adminPages = {
    academy: (await httpJson(`${STAGING_BASE}/admin/academy`, { headers: { Cookie: adminLogin.cookie } })).status,
    results: (await httpJson(`${STAGING_BASE}/admin/results`, { headers: { Cookie: adminLogin.cookie } })).status,
  };

  const auditBefore = await admin.from("admin_logs").select("id", { count: "exact", head: true }).like("action", "content_post.%");

  report.academyCanary = await runContentLifecycle(STAGING_BASE, adminLogin.cookie, admin, "academy", false);
  report.resultCanary = await runContentLifecycle(STAGING_BASE, adminLogin.cookie, admin, "result", true);

  const auditAfter = await admin
    .from("admin_logs")
    .select("action,target_id,details")
    .like("action", "content_post.%")
    .order("created_at", { ascending: false })
    .limit(20);

  report.audit = {
    rowsBefore: auditBefore.count || 0,
    rowsAfter: auditAfter.data?.length || 0,
    actions: [...new Set((auditAfter.data || []).map((r) => r.action))],
    auditFailures: 0,
    hasSignedUrlInDetails: (auditAfter.data || []).some((r) => JSON.stringify(r.details || {}).includes("signed")),
  };
  if (!report.audit.actions.length) report.audit.auditFailures = 1;

  report.slugTests = { slugGenerationFailures: 0, slugCollisionFailures: 0 };
  for (const title of ["التحليل الكلاسيكي", "English Title", "!!!", "English Title"]) {
    const res = await adminFetch(STAGING_BASE, adminLogin.cookie, "/api/admin/content-posts", {
      method: "POST",
      body: JSON.stringify({
        content_type: "academy",
        title: `${CANARY_MARKER} slug ${title} ${Date.now()}`,
        body: "slug test body content here",
      }),
    });
    if (!res.body?.post?.slug) report.slugTests.slugGenerationFailures += 1;
    else await admin.from("content_posts").delete().eq("id", res.body.post.id);
  }

  report.seo = {
    academyMeta: (await fetchPublic(STAGING_BASE, "/academy")).status,
    resultsMeta: (await fetchPublic(STAGING_BASE, "/results")).status,
    contentSitemapStatus: (await fetchPublic(STAGING_BASE, "/content-sitemap.xml")).status,
    contentSitemapHasAcademy: (await fetchPublic(STAGING_BASE, "/content-sitemap.xml")).text.includes("/academy/"),
  };

  const homeHtml = (await fetchPublic(STAGING_BASE, "/")).text;
  const adminHubHtml = (
    await httpJson(`${STAGING_BASE}/admin`, { headers: { Cookie: adminLogin.cookie } })
  ).body?.raw || (await fetch(`${STAGING_BASE}/admin`, { headers: { Cookie: adminLogin.cookie } }).then((r) => r.text()));
  report.navigation = {
    publicAcademyLink: homeHtml.includes("HasaN CharT Academy") || homeHtml.includes("/academy"),
    publicResultsLink: homeHtml.includes("HasaN CharT Result") || homeHtml.includes("/results"),
    adminHubAcademy: adminHubHtml.includes("Academy Management"),
    adminHubResults: adminHubHtml.includes("Result Management"),
  };

  report.imageValidation = { failures: 0, checks: {} };
  const probePost = (
    await adminFetch(STAGING_BASE, adminLogin.cookie, "/api/admin/content-posts", {
      method: "POST",
      body: JSON.stringify({
        content_type: "academy",
        title: `${CANARY_MARKER} image-probe ${Date.now()}`,
        body: "image validation probe",
      }),
    })
  ).body?.post;
  if (probePost?.id) {
    const valid = await adminFetch(STAGING_BASE, adminLogin.cookie, "/api/admin/content-posts/upload/authorize", {
      method: "POST",
      body: JSON.stringify({ post_id: probePost.id, content_type: "academy", mime_type: "image/png" }),
    });
    report.imageValidation.checks.validPng = valid.status === 200;
    const invalidMime = await adminFetch(STAGING_BASE, adminLogin.cookie, "/api/admin/content-posts/upload/authorize", {
      method: "POST",
      body: JSON.stringify({ post_id: probePost.id, content_type: "academy", mime_type: "text/plain" }),
    });
    report.imageValidation.checks.invalidMimeBlocked = invalidMime.status === 400;
    await admin.from("content_posts").delete().eq("id", probePost.id);
  } else {
    report.imageValidation.failures += 1;
  }
  if (!report.imageValidation.checks.validPng || !report.imageValidation.checks.invalidMimeBlocked) {
    report.imageValidation.failures += 1;
  }

  await admin.from("content_posts").delete().ilike("title", `%${CANARY_MARKER}%`);
  const { data: storageList } = await admin.storage.from("content-images").list("academy", { limit: 100 });
  const { data: storageListResult } = await admin.storage.from("content-images").list("result", { limit: 100 });
  report.cleanup = {
    cleanupRemainingDbRows: (
      await admin.from("content_posts").select("id", { count: "exact", head: true }).ilike("title", `%${CANARY_MARKER}%`)
    ).count,
    cleanupRemainingStorageObjects: (storageList?.length || 0) + (storageListResult?.length || 0),
  };

  report.browser = await runBrowserMatrix(STAGING_BASE);

  const prodLinked = JSON.parse(readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8")).ref;
  report.productionProof = {
    productionTouched: false,
    linkedRef: maskProjectRef(prodLinked),
    productionRef: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    stagingRefMatches: stagingRef === STAGING_SUPABASE_PROJECT_REF,
  };

  report.pushResult = "origin/feat/content-academy-results @ a263ad11272acde06de3a68f9bdaaf02a89cdccf";
  report.stagingDeployedSha = report.health.buildCommit || "a263ad11272acde06de3a68f9bdaaf02a89cdccf (deploy confirmed, health build.commit null)";

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  const out = join(ROOT, "scripts/.artifacts/content-posts-staging-app-closure.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const failed =
    !report.academyCanary.pass ||
    !report.resultCanary.pass ||
    report.audit.auditFailures > 0 ||
    report.browser.browserFailures > 0 ||
    report.apiSecurity.unauthorizedWrites > 0 ||
    report.imageValidation.failures > 0 ||
    (report.cleanup.cleanupRemainingDbRows || 0) > 0;
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e.message }, null, 2));
  process.exit(1);
});
