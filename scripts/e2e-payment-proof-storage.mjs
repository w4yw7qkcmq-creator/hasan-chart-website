#!/usr/bin/env node
/**
 * E2E: Payment proof storage flow (init → authorize → PUT → finalize → admin signed URL)
 * Usage: node scripts/e2e-payment-proof-storage.mjs [BASE_URL]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3010";
const ts = Date.now();
const PASS = "E2ePaymentProof123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@hasanchartworld.com";
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || "E2eAdminReal123!";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    })
);

const sbAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sbAnon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const JPEG_MIN = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x80, 0xff, 0xd9,
]);

// Minimal valid WEBP (RIFF....WEBP)
const WEBP_MIN = Buffer.from(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=",
  "base64"
);

const SVG_BAD = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const OVERSIZE = Buffer.alloc(8 * 1024 * 1024 + 1, 0xff);

const R = [];
const state = {};

function log(step, ok, detail) {
  R.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${step}] ${detail}`);
}

class Jar {
  constructor() {
    this.map = new Map();
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
  async json(path, { method = "GET", body, headers = {} } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        Cookie: this.header(),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    this.ingest(res);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text.slice(0, 300) };
    }
    return { res, data };
  }
}

async function ensureUser(email, username, password, role = "user") {
  const { data: list } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email === email);
  if (!user) {
    const created = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await sbAdmin.auth.admin.updateUserById(user.id, { email_confirm: true, password });
  }
  await sbAdmin.from("profiles").upsert({ id: user.id, email, username, role });
  return user.id;
}

async function siteSession(email, password) {
  const { data, error } = await sbAnon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const jar = new Jar();
  const sync = await jar.json("/api/auth/sync-session", {
    method: "POST",
    body: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    },
  });
  if (sync.res.status !== 200 || !sync.data?.success) {
    throw new Error(`sync-session failed: ${sync.res.status} ${JSON.stringify(sync.data)}`);
  }
  return jar;
}

async function runUploadFlow(jar, { label, buffer, mimeType, expectSuccess = true }) {
  const init = await jar.json("/api/subscription-request/init", {
    method: "POST",
    body: {
      username: state.username,
      plan_name: "VIP Spot",
      category: "Spot",
      price: "200",
      telegram_username: "@e2epay",
    },
  });

  if (!init.data?.success) {
    log(`${label}-init`, !expectSuccess, `init failed: ${JSON.stringify(init.data)}`);
    return null;
  }

  const sessionId = init.data.sessionId;
  const auth = await jar.json("/api/subscription-request/upload-authorize", {
    method: "POST",
    body: { sessionId, mimeType, sizeBytes: buffer.length },
  });

  if (!auth.data?.success) {
    log(`${label}-authorize`, !expectSuccess, `authorize: ${auth.data?.errorCode || auth.data?.error}`);
    return null;
  }

  const put = await fetch(auth.data.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: buffer,
  });

  if (!put.ok) {
    log(`${label}-put`, !expectSuccess, `PUT status=${put.status}`);
    return null;
  }

  const fin = await jar.json("/api/subscription-request/finalize", {
    method: "POST",
    body: { sessionId, objectPath: auth.data.objectPath, mimeType },
  });

  log(
    `${label}-finalize`,
    expectSuccess ? fin.res.status === 200 && fin.data?.success : fin.res.status !== 200 || !fin.data?.success,
    expectSuccess
      ? `requestId=${fin.data?.requestId} duplicate=${fin.data?.duplicate}`
      : `errorCode=${fin.data?.errorCode || fin.res.status} ${fin.data?.error || ""}`
  );

  return fin.data?.success ? { sessionId, requestId: fin.data.requestId, objectPath: auth.data.objectPath } : null;
}

(async () => {
  console.log(`\n=== Payment Proof Storage E2E @ ${BASE} ===\n`);

  const email = `e2e-pay-${ts}@test.local`;
  state.username = `PayE2E${ts}`;
  const userId = await ensureUser(email, state.username, PASS);
  state.userId = userId;
  log("0-user", true, email);

  const jar = await siteSession(email, PASS);
  log("0-session", true, "sync-session ok");

  // 1-9 JPEG happy path
  const jpegResult = await runUploadFlow(jar, {
    label: "jpeg",
    buffer: JPEG_MIN,
    mimeType: "image/jpeg",
    expectSuccess: true,
  });
  state.requestId = jpegResult?.requestId;
  state.sessionId = jpegResult?.sessionId;

  if (state.requestId) {
    const { data: row, error } = await sbAdmin
      .from("subscription_requests")
      .select("id,payment_proof,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes,status")
      .eq("id", state.requestId)
      .maybeSingle();
    log("7-db-request-once", !error && !!row?.id, `id=${row?.id} status=${row?.status}`);
    log("8-payment-proof-null", row?.payment_proof == null, `payment_proof=${row?.payment_proof === null ? "null" : "set"}`);
    log("9-path-exists", Boolean(row?.payment_proof_path), `path=${row?.payment_proof_path?.slice(0, 60)}...`);

    const { count } = await sbAdmin
      .from("subscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("plan_name", "VIP Spot");
    log("7-single-request-count", count === 1, `count=${count}`);

    const { data: sessionRow } = await sbAdmin
      .from("subscription_upload_sessions")
      .select("id,status,subscription_request_id")
      .eq("id", state.sessionId)
      .maybeSingle();
    log("session-completed", sessionRow?.status === "completed", `status=${sessionRow?.status} req=${sessionRow?.subscription_request_id}`);

    // double finalize idempotent
    const dupFin = await jar.json("/api/subscription-request/finalize", {
      method: "POST",
      body: { sessionId: state.sessionId, objectPath: jpegResult.objectPath, mimeType: "image/jpeg" },
    });
    log("double-finalize", dupFin.data?.duplicate === true, JSON.stringify(dupFin.data).slice(0, 120));
  }

  // Admin proof signed URL
  await ensureUser(ADMIN_EMAIL, "AdminE2E", ADMIN_PASS, "admin");
  const jarAdmin = await siteSession(ADMIN_EMAIL, ADMIN_PASS);

  if (state.requestId) {
    const proof1 = await jarAdmin.json(`/api/admin/financial-center/payment-proof/${state.requestId}`);
    log("10-admin-fetch", proof1.res.status === 200, `status=${proof1.res.status}`);
    const body1 = proof1.data;
    log("11-signed-url", body1?.proofType === "signed-url" && !!body1?.url, `proofType=${body1?.proofType}`);

    if (body1?.url) {
      const img1 = await fetch(body1.url);
      log("11-image-load", img1.ok, `content-type=${img1.headers.get("content-type")} size=${img1.headers.get("content-length")}`);

      await new Promise((r) => setTimeout(r, 2000));
      const proof2 = await jarAdmin.json(`/api/admin/financial-center/payment-proof/${state.requestId}`);
      const url2 = proof2.data?.url;
      log("12-new-signed-url", url2 && url2 !== body1.url, `regenerated=${Boolean(url2 && url2 !== body1.url)}`);
    }
  }

  // PNG + WEBP
  await runUploadFlow(jar, { label: "png", buffer: PNG_1PX, mimeType: "image/png", expectSuccess: true });
  await runUploadFlow(jar, { label: "webp", buffer: WEBP_MIN, mimeType: "image/webp", expectSuccess: true });

  // Invalid SVG
  await runUploadFlow(jar, { label: "svg-reject", buffer: SVG_BAD, mimeType: "image/png", expectSuccess: false });

  // Oversize - authorize should reject
  const initBig = await jar.json("/api/subscription-request/init", {
    method: "POST",
    body: {
      username: state.username,
      plan_name: "VIP Spot",
      category: "Spot",
      price: "200",
      telegram_username: "@e2epay",
    },
  });
  const authBig = await jar.json("/api/subscription-request/upload-authorize", {
    method: "POST",
    body: {
      sessionId: initBig.data?.sessionId,
      mimeType: "image/jpeg",
      sizeBytes: OVERSIZE.length,
    },
  });
  log("oversize-authorize", authBig.res.status === 413 || authBig.data?.errorCode === "UPLOAD_TOO_LARGE", JSON.stringify(authBig.data).slice(0, 120));

  // Base64 legacy route blocked
  const legacy = await jar.json("/api/subscription-request", {
    method: "POST",
    body: {
      plan_name: "VIP Spot",
      category: "Spot",
      price: "200",
      telegram_username: "@e2epay",
      payment_proof: "data:image/png;base64,abc",
      username: state.username,
    },
  });
  log("base64-410", legacy.res.status === 410, `status=${legacy.res.status} code=${legacy.data?.errorCode}`);

  // Admin dashboard should not list upload sessions
  const dash = await jarAdmin.json("/api/admin/dashboard?section=subscriptions&limit=50");
  const items = dash.data?.subscriptions?.items || dash.data?.subscriptions || [];
  const leaked = Array.isArray(items)
    ? items.some((i) => String(i?.status || "").match(/upload_|open|expired/i) && !i?.plan_name)
    : false;
  log("15-no-sessions-in-admin", !leaked, `subscription items=${Array.isArray(items) ? items.length : "n/a"}`);

  // Verify upload sessions table has rows but not in admin list
  const { count: sessionCount } = await sbAdmin
    .from("subscription_upload_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email);
  log("15-sessions-in-db-only", (sessionCount || 0) >= 1, `sessions=${sessionCount}`);

  const passCount = R.filter((x) => x.ok).length;
  const failCount = R.filter((x) => !x.ok).length;
  console.log(`\n=== SUMMARY: PASS ${passCount} / FAIL ${failCount} ===`);
  if (failCount) R.filter((x) => !x.ok).forEach((x) => console.log(`  FAIL ${x.step}: ${x.detail}`));
  console.log("\nSTATE", JSON.stringify(state, null, 2));
  process.exit(failCount ? 1 : 0);
})().catch((e) => {
  console.error("CRASH", e);
  process.exit(1);
});
