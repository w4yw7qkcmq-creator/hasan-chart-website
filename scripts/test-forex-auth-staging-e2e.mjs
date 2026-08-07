#!/usr/bin/env node
/**
 * Forex authenticated Staging E2E — real API checkout, admin activate, access, publish/status.
 * Staging Supabase only. Never touches Production.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertStagingSupabaseConfig,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import { resolveSubscriptionPlan } from "../lib/subscription-plan-registry.js";
import {
  matchesSignalSubscription,
  isActiveSubscriptionRow,
} from "../lib/vip-recommendation-eligibility.js";
import { normalizeAdminUserServiceType } from "../lib/admin-user-service-classifier.js";

const ROOT = process.cwd();
const DEV_PORT = Number(process.env.FOREX_E2E_PORT || 3018);
const TEST_DOMAIN = "staging-hcw.test";
const RUN = `forex-auth-${Date.now()}`;

const PNG_1PX_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PROOF_FIXTURE = Buffer.from(PNG_1PX_B64, "base64");
// Patch IHDR width/height to satisfy PAYMENT_PROOF_MIN_IMAGE_DIMENSION (10px).
PROOF_FIXTURE.writeUInt32BE(10, 16);
PROOF_FIXTURE.writeUInt32BE(10, 20);
const PROOF_MIME = "image/png";

const PLANS = {
  forexMonth: { plan_name: "فوركس - شهر", category: "باقات الفوركس", price: "$99" },
  forex3: { plan_name: "فوركس - 3 أشهر", category: "باقات الفوركس", price: "$250" },
  forexYear: { plan_name: "فوركس - سنة", category: "باقات الفوركس", price: "$800" },
  spotMonth: { plan_name: "سبوت - شهر", category: "باقات السبوت", price: "$50" },
  futuresMonth: { plan_name: "فيوتشر - شهر", category: "باقات الفيوتشر", price: "$99" },
};

const report = {
  runId: RUN,
  productionTargetConfirmedFalse: false,
  stagingProjectRefMasked: null,
  freshAuthAccounts: {},
  forexCheckoutE2E: false,
  canonicalPricingOk: false,
  arbitraryPriceAccepted: false,
  invalidPlanAccepted: false,
  categorySpoofAccepted: false,
  invalidPaymentNetworkAccepted: false,
  finalizePlanSwitchAccepted: false,
  adminForexRequestVisible: false,
  financeCenterForexVisible: false,
  proofReadable: false,
  adminActivationSucceeded: false,
  forexActiveSubscriberAllowed: false,
  forexAccessFailures: 0,
  spotRegressionFailures: 0,
  futuresRegressionFailures: 0,
  spotTamperingAccepted: false,
  futuresTamperingAccepted: false,
  forexPublishOk: false,
  forexStatusOk: false,
  statusEventRows: 0,
  statusDeliveryJobs: 0,
  cleanupRemainingRows: 0,
  browserMatrix: { skipped: true, note: "run browser pass separately with exported cookies" },
  errors: [],
};

const cleanup = {
  userIds: [],
  assignmentIds: [],
  sessionIds: [],
  requestIds: [],
  signalIds: [],
  uploadPaths: [],
};

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

function loadStagingServerEnv() {
  const staging = parseEnvFile(resolve(ROOT, ".env.staging.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.staging.bootstrap.local"));
  const env = { ...process.env, NODE_ENV: "development", PORT: String(DEV_PORT) };
  Object.assign(env, staging, bootstrap);
  env.NEXT_PUBLIC_SUPABASE_URL = staging.STAGING_SUPABASE_URL;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = staging.STAGING_SUPABASE_ANON_KEY;
  env.SUPABASE_SERVICE_ROLE_KEY = staging.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  env.IAM_DB = "true";
  env.IAM_API = "true";
  env.IAM_UI = "true";
  env.IAM_RLS = "false";
  env.VIP_STATUS_NOTIFICATIONS_ENABLED = env.VIP_STATUS_NOTIFICATIONS_ENABLED || "true";
  env.PAYMENT_PROOF_STORAGE_ENABLED = env.PAYMENT_PROOF_STORAGE_ENABLED || "true";
  return { env, staging, bootstrap };
}

class Jar {
  constructor() {
    this.map = new Map();
  }
  setCookie(header) {
    if (!header) return;
    const m = header.match(/hc_access_token=([^;]+)/);
    if (m) this.map.set("hc_access_token", m[1]);
  }
  ingest(res) {
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async json(base, path, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        Cookie: this.header(),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    this.ingest(res);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { _raw: text.slice(0, 200) };
    }
    return { res, data };
  }
}

async function waitForServer(port) {
  const start = Date.now();
  while (Date.now() - start < 180000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Server startup timeout");
}

async function ensureUser(sb, { email, username, password, meta = {} }) {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { ...meta, staging_canary: RUN },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { ...meta, staging_canary: RUN } });
  }
  await sb.from("profiles").upsert({ id: user.id, email, username, role: "user" });
  cleanup.userIds.push(user.id);
  return user;
}

async function loginJar(base, env, email, password) {
  const anon = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error(`login failed ${email}: ${error?.message}`);
  const jar = new Jar();
  const sync = await jar.json(base, "/api/auth/sync-session", {
    method: "POST",
    body: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    },
  });
  if (sync.res.status !== 200 || !sync.data?.success) {
    throw new Error(`sync-session failed ${email}: ${sync.res.status} ${JSON.stringify(sync.data)}`);
  }
  return jar;
}

async function checkoutFlow(base, jar, sb, { plan, network, username, telegram = "@forex_canary" }) {
  const init = await jar.json(base, "/api/subscription-request/init", {
    method: "POST",
    body: {
      username,
      plan_name: plan.plan_name,
      category: plan.category,
      price: plan.price,
      telegram_username: telegram,
      payment_network: network,
    },
  });
  if (!init.data?.success) {
    return { ok: false, stage: "init", init };
  }
  const sessionId = init.data.sessionId;
  cleanup.sessionIds.push(sessionId);

  const auth = await jar.json(base, "/api/subscription-request/upload-authorize", {
    method: "POST",
    body: { sessionId, mimeType: PROOF_MIME, sizeBytes: PROOF_FIXTURE.length },
  });
  if (!auth.data?.success) return { ok: false, stage: "authorize", auth };

  const put = await fetch(auth.data.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": PROOF_MIME },
    body: PROOF_FIXTURE,
  });
  if (!put.ok) return { ok: false, stage: "put", status: put.status };

  cleanup.uploadPaths.push(auth.data.objectPath);

  const fin = await jar.json(base, "/api/subscription-request/finalize", {
    method: "POST",
    body: { sessionId, objectPath: auth.data.objectPath, mimeType: PROOF_MIME },
  });
  if (!fin.data?.success) return { ok: false, stage: "finalize", fin };

  const requestId = fin.data.requestId;
  cleanup.requestIds.push(requestId);

  const { data: row } = await sb
    .from("subscription_requests")
    .select("id,plan_name,category,price,payment_network,status,payment_proof_path")
    .eq("id", requestId)
    .maybeSingle();

  return { ok: true, sessionId, requestId, row, init, fin };
}

async function initOnly(base, jar, plan, extra = {}) {
  return jar.json(base, "/api/subscription-request/init", {
    method: "POST",
    body: {
      username: extra.username || "probe",
      plan_name: plan.plan_name,
      category: plan.category,
      price: extra.price ?? plan.price,
      telegram_username: "@probe",
      payment_network: extra.network || "BEP20",
      ...extra.body,
    },
  });
}

async function readSessionPrice(sb, sessionId) {
  const { data } = await sb
    .from("subscription_upload_sessions")
    .select("price,plan_name,category")
    .eq("id", sessionId)
    .maybeSingle();
  return data;
}

async function grantAdminRoleStaging(sb, userId) {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const { data: existing } = await sb
    .from("iam_user_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("role_id", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (existing?.id) {
    cleanup.assignmentIds.push(existing.id);
    return true;
  }
  const { data, error } = await sb
    .from("iam_user_assignments")
    .insert({
      user_id: userId,
      role_id: "admin",
      organization_id: orgId,
      grant_reason: `forex-canary ${RUN}`,
    })
    .select("id")
    .single();
  if (error) return false;
  if (data?.id) cleanup.assignmentIds.push(data.id);
  return true;
}

async function fetchText(base, cookie, path) {
  const res = await fetch(`${base}${path}`, { headers: { Cookie: cookie }, redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

async function activateRequest(base, adminJar, requestId, userEmail, planName) {
  return adminJar.json(base, "/api/admin/dashboard", {
    method: "POST",
    body: {
      action: "update-subscription-request",
      requestId,
      status: "مفعل",
      userEmail,
      planName,
    },
  });
}

async function assertStagingCheckoutSchema(sb) {
  const { error } = await sb.from("subscription_upload_sessions").select("payment_network").limit(0);
  if (error?.message?.includes("payment_network")) {
    return {
      ok: false,
      code: "STAGING_MIGRATION_REQUIRED",
      migration: "20260727_subscription_payment_network.sql",
    };
  }
  return { ok: !error, code: error?.code || null, message: error?.message || null };
}

async function main() {
  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  const { env, staging, bootstrap } = loadStagingServerEnv();
  const guard = assertStagingSupabaseConfig({
    projectRef: staging.STAGING_SUPABASE_PROJECT_REF,
    url: staging.STAGING_SUPABASE_URL,
  });
  report.productionTargetConfirmedFalse = guard.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF;
  report.stagingProjectRefMasked = guard.maskedProjectRef;
  if (!report.productionTargetConfirmedFalse) throw new Error("Production target detected");

  const password = crypto.randomBytes(18).toString("base64url");
  const sb = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const accounts = {
    admin: { email: `forex-admin+${RUN}@${TEST_DOMAIN}`, username: `FxAdmin${RUN.slice(-6)}` },
    forex: { email: `forex-user+${RUN}@${TEST_DOMAIN}`, username: `FxUser${RUN.slice(-6)}` },
    futures: { email: `futures-user+${RUN}@${TEST_DOMAIN}`, username: `FutUser${RUN.slice(-6)}` },
    spot: { email: `spot-user+${RUN}@${TEST_DOMAIN}`, username: `SpotUser${RUN.slice(-6)}` },
    expired: { email: `forex-expired+${RUN}@${TEST_DOMAIN}`, username: `FxExp${RUN.slice(-6)}` },
  };

  for (const [key, acc] of Object.entries(accounts)) {
    acc.user = await ensureUser(sb, { ...acc, password, meta: { canary: key } });
    report.freshAuthAccounts[key] = { emailMasked: acc.email.replace(/(.{4}).+@/, "$1***@"), userId: acc.user.id };
  }

  const schema = await assertStagingCheckoutSchema(sb);
  if (!schema.ok) {
    report.stagingSchemaReady = false;
    report.stagingSchemaBlocker = schema;
    report.errors.push(schema.code || "STAGING_SCHEMA");
    const artifact = join(ROOT, "scripts/.artifacts", `forex-auth-staging-e2e-${RUN}.json`);
    writeFileSync(artifact, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, artifact }, null, 2));
    process.exit(1);
  }
  report.stagingSchemaReady = true;

  const server = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let base = "";
  try {
    await waitForServer(DEV_PORT);
    base = `http://127.0.0.1:${DEV_PORT}`;

    const adminGranted = await grantAdminRoleStaging(sb, accounts.admin.user.id);
    if (!adminGranted) report.errors.push("ADMIN_GRANT_FAILED");

    const adminJar = await loginJar(base, env, accounts.admin.email, password);
    const forexJar = await loginJar(base, env, accounts.forex.email, password);
    const futuresJar = await loginJar(base, env, accounts.futures.email, password);
    const spotJar = await loginJar(base, env, accounts.spot.email, password);

    writeFileSync(
      `/tmp/forex-staging-cookies-${RUN}.json`,
      JSON.stringify(
        {
          admin: adminJar.header(),
          forex: forexJar.header(),
          futures: futuresJar.header(),
          spot: spotJar.header(),
          base,
        },
        null,
        2
      )
    );

    // --- Forex full checkout ---
    const checkout = await checkoutFlow(base, forexJar, sb, {
      plan: PLANS.forexMonth,
      network: "BEP20",
      username: accounts.forex.username,
    });
    report.forexCheckoutE2E = checkout.ok;
    if (!checkout.ok) report.errors.push(`FOREX_CHECKOUT:${checkout.stage}`);

    report.canonicalPricingOk =
      checkout.ok &&
      checkout.row?.plan_name === PLANS.forexMonth.plan_name &&
      checkout.row?.category === PLANS.forexMonth.category &&
      checkout.row?.price === "$99" &&
      checkout.row?.payment_network === "BEP20" &&
      checkout.row?.status === "بانتظار المراجعة" &&
      Boolean(checkout.row?.payment_proof_path);

    for (const [key, plan] of [
      ["forex3", PLANS.forex3],
      ["forexYear", PLANS.forexYear],
    ]) {
      const resolved = resolveSubscriptionPlan({
        plan_name: plan.plan_name,
        category: plan.category,
        price: "$1",
      });
      if (!resolved.ok || resolved.plan.price !== plan.price) {
        report.errors.push(`PLAN_MAP_${key}`);
        report.canonicalPricingOk = false;
      }
    }

    // --- Security probes ---
    for (const price of ["$1", "$9999", 1, "-5"]) {
      const probe = await initOnly(base, forexJar, PLANS.forexMonth, { price, username: accounts.forex.username });
      if (!probe.data?.success || !probe.data.sessionId) continue;
      const stored = await readSessionPrice(sb, probe.data.sessionId);
      if (stored?.price !== "$99") report.arbitraryPriceAccepted = true;
      await sb.from("subscription_upload_sessions").delete().eq("id", probe.data.sessionId);
    }

    for (const plan_name of ["forex_super_vip", "anything", ""]) {
      const probe = await initOnly(base, forexJar, PLANS.forexMonth, { body: { plan_name, category: PLANS.forexMonth.category } });
      if (probe.data?.success) report.invalidPlanAccepted = true;
    }

    const catSpoof = await initOnly(base, forexJar, PLANS.forexMonth, {
      body: { plan_name: PLANS.forexMonth.plan_name, category: "باقات الفيوتشر" },
    });
    if (catSpoof.data?.success) report.categorySpoofAccepted = true;

    const badNet = await initOnly(base, forexJar, PLANS.forexMonth, { network: "ETH_MAINNET" });
    if (badNet.data?.success) report.invalidPaymentNetworkAccepted = true;

    const tamperInit = await initOnly(base, forexJar, PLANS.forexMonth, { username: accounts.forex.username });
    if (tamperInit.data?.success && tamperInit.data.sessionId) {
      await sb
        .from("subscription_upload_sessions")
        .update({ plan_name: PLANS.forexYear.plan_name, price: "$99" })
        .eq("id", tamperInit.data.sessionId);
      const auth = await forexJar.json(base, "/api/subscription-request/upload-authorize", {
        method: "POST",
        body: { sessionId: tamperInit.data.sessionId, mimeType: PROOF_MIME, sizeBytes: PROOF_FIXTURE.length },
      });
      if (auth.data?.success) {
        await fetch(auth.data.signedUrl, { method: "PUT", headers: { "Content-Type": PROOF_MIME }, body: PROOF_FIXTURE });
        const fin = await forexJar.json(base, "/api/subscription-request/finalize", {
          method: "POST",
          body: { sessionId: tamperInit.data.sessionId, objectPath: auth.data.objectPath, mimeType: PROOF_MIME },
        });
        if (fin.data?.success) report.finalizePlanSwitchAccepted = true;
      }
      await sb.from("subscription_upload_sessions").delete().eq("id", tamperInit.data.sessionId);
    }

    // --- Admin pending visibility ---
    if (checkout.requestId) {
      const dash = await adminJar.json(base, `/api/admin/dashboard?section=subscriptions&limit=50`);
      const items = dash.data?.subscription_requests || dash.data?.items || [];
      const found = items.find((r) => String(r.id) === String(checkout.requestId));
      report.adminForexRequestVisible = Boolean(found);
      if (found) {
        const cls = normalizeAdminUserServiceType(found);
        if (cls !== "vip_forex") report.errors.push("ADMIN_CLASSIFICATION");
      }

      const finance = await adminJar.json(
        base,
        `/api/admin/financial-center?section=subscriptions&limit=50`
      );
      const fItems = finance.data?.items || finance.data?.subscriptions || [];
      report.financeCenterForexVisible = fItems.some((r) => String(r.id) === String(checkout.requestId));

      const proof = await adminJar.json(
        base,
        `/api/admin/financial-center/payment-proof/${checkout.requestId}`
      );
      report.proofReadable =
        proof.res.status === 200 &&
        (Boolean(proof.data?.signedUrl) || Boolean(proof.data?.url) || Boolean(proof.data?.inlineDataUrl));
    }

    // --- Admin activate ---
    if (checkout.requestId) {
      const act = await activateRequest(
        base,
        adminJar,
        checkout.requestId,
        accounts.forex.email,
        PLANS.forexMonth.plan_name
      );
      report.adminActivationSucceeded = act.data?.success === true;
      if (!report.adminActivationSucceeded) report.errors.push(`ACTIVATE:${act.data?.error || act.res.status}`);

      const { data: activeRow } = await sb
        .from("subscription_requests")
        .select("id,status,plan_name,category,price,started_at,expires_at")
        .eq("id", checkout.requestId)
        .maybeSingle();
      report.forexActiveSubscriberAllowed =
        activeRow?.status === "مفعل" &&
        matchesSignalSubscription(`${activeRow.plan_name} ${activeRow.category}`, "forex");
      if (!report.forexActiveSubscriberAllowed) report.forexAccessFailures += 1;
    }

    // --- Access checks ---
    const fxSignals = await forexJar.json(base, "/api/vip-signals?type=forex");
    if (fxSignals.res.status === 403 || fxSignals.data?.error) report.forexAccessFailures += 1;

    const vipForexPage = await forexJar.json(base, "/vip-forex");
    if (vipForexPage.res.status >= 500) report.forexAccessFailures += 1;

    // Futures-only + Spot-only: activate via checkout + admin
    for (const [key, jar, acc, plan] of [
      ["futures", futuresJar, accounts.futures, PLANS.futuresMonth],
      ["spot", spotJar, accounts.spot, PLANS.spotMonth],
    ]) {
      const flow = await checkoutFlow(base, jar, sb, { plan, network: "TRC20", username: acc.username, telegram: `@${key}_canary` });
      if (flow.ok && flow.requestId) {
        cleanup.requestIds.push(flow.requestId);
        await activateRequest(base, adminJar, flow.requestId, acc.email, plan.plan_name);
      }
    }

    const futDeny = await futuresJar.json(base, "/api/vip-signals?type=forex");
    const spotDeny = await spotJar.json(base, "/api/vip-signals?type=forex");
    if (futDeny.res.status !== 403 && !futDeny.data?.error) report.forexAccessFailures += 1;
    if (spotDeny.res.status !== 403 && !spotDeny.data?.error) report.forexAccessFailures += 1;

    const expiredJar = await loginJar(base, env, accounts.expired.email, password);

    // --- Expired forex user ---
    const expFlow = await checkoutFlow(base, expiredJar, sb, {
      plan: PLANS.forexMonth,
      network: "BEP20",
      username: accounts.expired.username,
      telegram: "@expired",
    });
    if (expFlow.ok && expFlow.requestId) {
      cleanup.requestIds.push(expFlow.requestId);
      await activateRequest(base, adminJar, expFlow.requestId, accounts.expired.email, PLANS.forexMonth.plan_name);
      await sb
        .from("subscription_requests")
        .update({ expires_at: new Date(Date.now() - 86400000).toISOString() })
        .eq("id", expFlow.requestId);
      const expApi = await expiredJar.json(base, "/api/vip-signals?type=forex");
      if (expApi.res.status !== 403 && !expApi.data?.error) report.forexAccessFailures += 1;
    }

    // --- Spot regression ---
    for (const network of ["BEP20", "TRC20"]) {
      const s = await initOnly(base, spotJar, PLANS.spotMonth, { network, username: accounts.spot.username });
      if (!s.data?.success) {
        report.spotRegressionFailures += 1;
        continue;
      }
      const stored = await readSessionPrice(sb, s.data.sessionId);
      if (stored?.price !== "$50" || stored?.category !== PLANS.spotMonth.category) report.spotRegressionFailures += 1;
      await sb.from("subscription_upload_sessions").delete().eq("id", s.data.sessionId);
    }
    const spotTamper = await initOnly(base, spotJar, PLANS.spotMonth, { price: "$1", username: accounts.spot.username });
    if (spotTamper.data?.success) {
      const stored = await readSessionPrice(sb, spotTamper.data.sessionId);
      if (stored?.price !== "$50") report.spotTamperingAccepted = true;
      await sb.from("subscription_upload_sessions").delete().eq("id", spotTamper.data.sessionId);
    }

    // --- Futures regression ---
    for (const network of ["BEP20", "TRC20"]) {
      const f = await initOnly(base, futuresJar, PLANS.futuresMonth, { network, username: accounts.futures.username });
      if (!f.data?.success) {
        report.futuresRegressionFailures += 1;
        continue;
      }
      const stored = await readSessionPrice(sb, f.data.sessionId);
      if (stored?.price !== "$99") report.futuresRegressionFailures += 1;
      await sb.from("subscription_upload_sessions").delete().eq("id", f.data.sessionId);
    }
    const futTamper = await initOnly(base, futuresJar, PLANS.futuresMonth, { price: "$1", username: accounts.futures.username });
    if (futTamper.data?.success) {
      const stored = await readSessionPrice(sb, futTamper.data.sessionId);
      if (stored?.price !== "$99") report.futuresTamperingAccepted = true;
      await sb.from("subscription_upload_sessions").delete().eq("id", futTamper.data.sessionId);
    }

    // --- Publish forex canary ---
    const pub = await adminJar.json(base, "/api/admin/dashboard", {
      method: "POST",
      body: {
        action: "publish-vip-signal",
        requestId: `canary-${RUN}`,
        signalType: "forex",
        coin: `EURUSD-STAGING-CANARY-${RUN.slice(-6)}`,
        entry: "STAGING",
        targets: "STAGING",
        stopLoss: "STAGING",
        notes: `STAGING CANARY ${RUN}`,
      },
    });
    report.forexPublishOk = pub.data?.success === true;
    const signalId = pub.data?.id || pub.data?.signalId;
    if (signalId) cleanup.signalIds.push(signalId);

    if (signalId) {
      const status = await adminJar.json(base, `/api/admin/vip-recommendations/${signalId}/status-update`, {
        method: "POST",
        body: { eventType: "target_1_hit", requestId: `${RUN}-status` },
      });
      report.forexStatusOk = status.data?.success === true || status.data?.accepted === true;

      const { count: eventRows } = await sb
        .from("vip_signal_status_events")
        .select("id", { count: "exact", head: true })
        .eq("signal_id", signalId);
      report.statusEventRows = eventRows || 0;

      const { data: deliveries } = await sb
        .from("vip_signal_status_deliveries")
        .select("id,channel,user_email")
        .eq("signal_id", signalId);
      report.statusDeliveryJobs = deliveries?.length || 0;
    }

    // Admin VIP tab HTML probe
    const adminVip = await fetchText(base, adminJar.header(), "/admin?tab=vip");
    if (adminVip.status !== 200 || !/Forex|فوركس|💱/.test(adminVip.text)) {
      report.errors.push("ADMIN_VIP_TAB");
    }
  } finally {
    if (!server.killed) server.kill("SIGTERM");
  }

  // --- Cleanup canary rows ---
  for (const id of cleanup.signalIds) {
    await sb.from("vip_signal_status_deliveries").delete().eq("signal_id", id);
    await sb.from("vip_signal_status_events").delete().eq("signal_id", id);
    await sb.from("vip_signals").delete().eq("id", id);
  }
  for (const id of cleanup.requestIds) {
    await sb.from("subscription_requests").delete().eq("id", id);
  }
  for (const id of cleanup.sessionIds) {
    await sb.from("subscription_upload_sessions").delete().eq("id", id);
  }
  for (const id of cleanup.assignmentIds) {
    await sb.from("iam_user_assignments").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  }

  const emails = Object.values(accounts).map((a) => a.email);
  const { count } = await sb
    .from("subscription_requests")
    .select("id", { count: "exact", head: true })
    .in("user_email", emails);
  report.cleanupRemainingRows = count || 0;

  for (const uid of cleanup.userIds) {
    await sb.auth.admin.deleteUser(uid).catch(() => {});
  }

  const artifact = join(ROOT, "scripts/.artifacts", `forex-auth-staging-e2e-${RUN}.json`);
  writeFileSync(artifact, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, artifact }, null, 2));

  const fail =
    report.errors.length ||
    report.forexAccessFailures ||
    report.spotRegressionFailures ||
    report.futuresRegressionFailures ||
    report.cleanupRemainingRows ||
    !report.productionTargetConfirmedFalse ||
    !report.forexCheckoutE2E ||
    !report.adminActivationSucceeded ||
    !report.forexActiveSubscriberAllowed ||
    report.arbitraryPriceAccepted ||
    report.invalidPlanAccepted ||
    report.categorySpoofAccepted ||
    report.invalidPaymentNetworkAccepted ||
    report.finalizePlanSwitchAccepted ||
    report.spotTamperingAccepted ||
    report.futuresTamperingAccepted;

  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
