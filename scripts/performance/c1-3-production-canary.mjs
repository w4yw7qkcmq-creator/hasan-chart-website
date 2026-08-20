#!/usr/bin/env node
/**
 * C1.3 production read-only canary — no secrets in artifact output.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://www.hasanchartworld.com";
const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "scripts/performance/.artifacts");

function parseEnvFile(path) {
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

function loadEnv() {
  return {
    ...parseEnvFile(join(ROOT, ".env.local")),
    ...parseEnvFile(join(ROOT, ".env.production.bootstrap.local")),
  };
}

function maskEmail(email = "") {
  const [local, domain = ""] = String(email).split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

async function login(email, password, env) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || "login_failed");
  }
  return `hc_access_token=${data.session.access_token}; hc_refresh_token=${data.session.refresh_token}`;
}

async function fetchJson(path, cookie, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status,
    bytes: Buffer.byteLength(text, "utf8"),
    cacheControl: res.headers.get("cache-control") || "",
    json,
    text,
  };
}

function listHeavyKeys(items = []) {
  const heavy = new Set();
  for (const row of items) {
    for (const key of Object.keys(row || {})) {
      if (["before_data", "after_data", "details", "metadata", "user_agent", "session_id_hash"].includes(key)) {
        heavy.add(key);
      }
    }
  }
  return [...heavy];
}

function ids(items = []) {
  return (items || []).map((r) => r?.id).filter(Boolean);
}

async function testIamList(name, path, legacyKey, cookie) {
  const first = await fetchJson(path, cookie);
  const items = first.json?.items || first.json?.[legacyKey] || [];
  const pagination = first.json?.pagination || {};
  const page2 =
    pagination.nextCursor && pagination.hasMore
      ? await fetchJson(`${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(pagination.nextCursor)}`, cookie)
      : null;
  const page2Items = page2?.json?.items || page2?.json?.[legacyKey] || [];
  const overlap = ids(items).filter((id) => ids(page2Items).includes(id));
  const badCursor = await fetchJson(`${path}${path.includes("?") ? "&" : "?"}cursor=not-valid`, cookie);
  const limit200 = await fetchJson(`${path}${path.includes("?") ? "&" : "?"}limit=999`, cookie);

  let detail = null;
  const sampleId = items[0]?.id;
  if (sampleId) {
    const sep = path.includes("?") ? "&" : "?";
    detail = await fetchJson(`${path}${sep}id=${encodeURIComponent(sampleId)}&includeMetadata=true`, cookie);
  }

  return {
    name,
    status: first.status,
    bytes: first.bytes,
    rowCount: items.length,
    legacyAliasCount: (first.json?.[legacyKey] || []).length,
    legacyMatchesItems: JSON.stringify(first.json?.items || []) === JSON.stringify(first.json?.[legacyKey] || []),
    pagination,
    heavyFieldsInList: listHeavyKeys(items),
    page2: page2
      ? {
          status: page2.status,
          bytes: page2.bytes,
          rowCount: page2Items.length,
          duplicateIds: overlap,
        }
      : null,
    badCursorStatus: badCursor.status,
    limitEnforced: (limit200.json?.pagination?.limit || limit200.json?.items?.length || 0) <= 100,
    cacheControl: first.cacheControl,
    detail: detail
      ? {
          status: detail.status,
          bytes: detail.bytes,
          hasMetadata: Boolean(
            detail.json?.item?.metadata ||
              detail.json?.item?.before_data ||
              detail.json?.item?.details
          ),
        }
      : null,
  };
}

async function main() {
  const env = loadEnv();
  const email = env.IAM_OWNER_EMAIL;
  const password = env.PRODUCTION_OWNER_PASSWORD;
  if (!email || !password || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("Missing owner or supabase env for canary");
    process.exit(1);
  }

  const cookie = await login(email, password, env);
  const health = await fetchJson("/api/health", cookie);

  const audit = await testIamList("audit", "/api/iam/audit?limit=50", "logs", cookie);
  const security = await testIamList(
    "security-events",
    "/api/iam/security-events?limit=50",
    "events",
    cookie
  );
  const sessions = await testIamList(
    "sessions",
    "/api/iam/sessions?activeOnly=true&limit=50",
    "sessions",
    cookie
  );

  const notifDefault = await fetchJson("/api/notification-hub/feed?limit=20", cookie);
  const notifItems = notifDefault.json?.items || [];
  const notifPag = notifDefault.json?.pagination || {};
  const notifPage2 =
    notifPag.nextCursor && notifPag.hasMore
      ? await fetchJson(
          `/api/notification-hub/feed?limit=20&cursor=${encodeURIComponent(notifPag.nextCursor)}`,
          cookie
        )
      : null;
  const notifNoCount = await fetchJson("/api/notification-hub/feed?limit=20&includeUnreadCount=false", cookie);

  const adminUsers = await fetchJson("/api/admin/user-management?page=1&pageSize=25", cookie);
  const adminSearchShort = await fetchJson("/api/admin/user-management?search=a", cookie);
  const adminSearchOk = await fetchJson("/api/admin/user-management?search=has", cookie);

  const includeTotal = await fetchJson("/api/iam/audit?limit=10&includeTotal=true", cookie);

  const report = {
    phase: "C1.3-production-canary",
    capturedAt: new Date().toISOString(),
    deployedCommit: health.json?.build?.commit || null,
    health: {
      status: health.json?.status,
      readiness: health.json?.readiness,
      bytes: health.bytes,
      databaseOk: health.json?.checks?.database?.status === "ok" || health.json?.database?.status === "ok",
    },
    actor: { emailMasked: maskEmail(email) },
    iam: { audit, security, sessions, includeTotal: { status: includeTotal.status, total: includeTotal.json?.pagination?.total ?? null } },
    notifications: {
      default: {
        status: notifDefault.status,
        bytes: notifDefault.bytes,
        rowCount: notifItems.length,
        heavyFieldsInList: listHeavyKeys(notifItems),
        pagination: notifPag,
        unreadCount: notifDefault.json?.unreadCount,
        cacheControl: notifDefault.cacheControl,
      },
      page2: notifPage2
        ? {
            status: notifPage2.status,
            bytes: notifPage2.bytes,
            duplicateIds: ids(notifItems).filter((id) => ids(notifPage2.json?.items).includes(id)),
          }
        : null,
      includeUnreadCountFalse: {
        status: notifNoCount.status,
        unreadCountPresent: "unreadCount" in (notifNoCount.json || {}),
        unreadCountValue: notifNoCount.json?.unreadCount,
      },
    },
    adminUsers: {
      default: {
        status: adminUsers.status,
        bytes: adminUsers.bytes,
        pageSize: adminUsers.json?.pagination?.pageSize,
        userCount: (adminUsers.json?.users || []).length,
      },
      searchOneChar: {
        status: adminSearchShort.status,
        bytes: adminSearchShort.bytes,
        userCount: (adminSearchShort.json?.users || []).length,
      },
      searchTwoChar: {
        status: adminSearchOk.status,
        bytes: adminSearchOk.bytes,
        userCount: (adminSearchOk.json?.users || []).length,
      },
    },
    verdict: "PENDING",
  };

  const failures = [];
  if (health.json?.build?.commit?.slice(0, 7) !== "624d928") failures.push("commit_mismatch");
  if (audit.status !== 200 || security.status !== 200 || sessions.status !== 200) failures.push("iam_status");
  if (audit.badCursorStatus !== 400) failures.push("audit_bad_cursor");
  if (audit.heavyFieldsInList.length) failures.push("audit_heavy_fields");
  if (security.heavyFieldsInList.length) failures.push("security_heavy_fields");
  if (notifDefault.status !== 200) failures.push("notifications_status");
  if (listHeavyKeys(notifItems).includes("metadata")) failures.push("notification_metadata");
  if ((audit.page2?.duplicateIds || []).length) failures.push("audit_duplicates");
  if ((security.page2?.duplicateIds || []).length) failures.push("security_duplicates");
  if ((sessions.page2?.duplicateIds || []).length) failures.push("sessions_duplicates");
  if ((notifPage2?.duplicateIds || []).length) failures.push("notification_duplicates");

  report.verdict = failures.length ? "C1.3 BLOCKED" : "C1.3 PRODUCTION VALIDATED";
  report.failures = failures;

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const outPath = join(ARTIFACT_DIR, `c1-3-production-canary-${ts}.json`);
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: report.verdict, outPath, failures, deployedCommit: report.deployedCommit }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
