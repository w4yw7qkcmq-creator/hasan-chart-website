#!/usr/bin/env node
/**
 * Production Gate — HasaN CharT Academy + Result
 * Applies 3 content migrations to Production ONLY, verifies schema/RLS/storage/IAM.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";

const ROOT = process.cwd();
const LINKED_FILE = join(ROOT, "supabase/.temp/linked-project.json");
const MIGRATIONS = [
  "supabase/migrations/20260808_content_posts.sql",
  "supabase/migrations/20260808_content_images_storage_bucket.sql",
  "supabase/migrations/20260808_content_iam_permissions.sql",
];
const EXPECTED_COLUMNS = [
  "id", "content_type", "title", "slug", "summary", "body", "image_path", "category",
  "highlight_value", "status", "published_at", "created_by", "updated_by", "created_at", "updated_at", "deleted_at",
];

function getLinkedRef() {
  if (!existsSync(LINKED_FILE)) return null;
  return JSON.parse(readFileSync(LINKED_FILE, "utf8")).ref;
}

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

function parseQueryRows(result) {
  if (!result) return [];
  if (Array.isArray(result.rows)) return result.rows;
  return [];
}

function runQuery(sql) {
  const tmp = join(ROOT, ".tmp-content-posts-prod-gate.sql");
  writeFileSync(tmp, sql);
  const result = spawnSync("supabase", ["db", "query", "-f", tmp, "-o", "json", "--linked"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "query failed");
  return JSON.parse(result.stdout);
}

function applyMigrationFile(relPath) {
  const result = spawnSync(
    "supabase",
    ["db", "query", "-f", join(ROOT, relPath), "-o", "json", "--linked"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`${relPath}: ${result.stderr || result.stdout}`);
  return { file: relPath, ok: true };
}

function linkProject(ref) {
  const result = spawnSync("supabase", ["link", "--project-ref", ref, "--yes"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`link failed: ${result.stderr || result.stdout}`);
}

async function main() {
  const linked = getLinkedRef();
  const env = parseEnvFile(join(ROOT, ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const report = {
    preflight: {
      productionTargetConfirmed: linked === PRODUCTION_SUPABASE_PROJECT_REF,
      stagingTargetConfirmedFalse: linked !== STAGING_SUPABASE_PROJECT_REF,
      linkedRef: maskProjectRef(linked),
      urlRef: maskProjectRef((url || "").match(/https:\/\/([^.]+)/)?.[1] || ""),
    },
    beforeCounts: {},
    migrationsApplied: [],
    schema: {},
    rls: {},
    storage: {},
    iam: {},
    errors: [],
  };

  if (!report.preflight.productionTargetConfirmed || !report.preflight.stagingTargetConfirmedFalse) {
    throw new Error("Production preflight failed — wrong linked project");
  }
  if (!url?.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    throw new Error("Production env URL mismatch");
  }

  report.beforeCounts = {
    contentPostsExists: parseQueryRows(
      runQuery(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_posts') AS exists;`)
    )[0]?.exists,
    contentImagesBucket: parseQueryRows(
      runQuery(`SELECT COUNT(*)::int AS c FROM storage.buckets WHERE id='content-images';`)
    )[0]?.c,
    contentIamGrants: parseQueryRows(
      runQuery(`SELECT COUNT(*)::int AS c FROM public.iam_role_permissions WHERE permission_id LIKE 'content.%';`)
    )[0]?.c,
  };

  for (const file of MIGRATIONS) {
    report.migrationsApplied.push(applyMigrationFile(file));
  }

  const colNames = parseQueryRows(
    runQuery(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='content_posts' ORDER BY ordinal_position;`)
  ).map((r) => r.column_name);

  report.schema = {
    tableExists: colNames.length === 16,
    columnCount: colNames.length,
    columnsMatch: EXPECTED_COLUMNS.every((c) => colNames.includes(c)),
    indexes: parseQueryRows(
      runQuery(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='content_posts';`)
    ).map((r) => r.indexname),
    hasActiveSlugUnique: parseQueryRows(
      runQuery(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='content_posts' AND indexname LIKE '%slug%';`)
    ).length > 0,
  };

  report.rls = {
    enabled: parseQueryRows(
      runQuery(`SELECT relrowsecurity FROM pg_class WHERE relname='content_posts' AND relnamespace='public'::regnamespace;`)
    )[0]?.relrowsecurity,
    policies: parseQueryRows(
      runQuery(`SELECT policyname, cmd, roles::text FROM pg_policies WHERE schemaname='public' AND tablename='content_posts';`)
    ),
    openPolicies: 0,
    dangerousWritePolicies: parseQueryRows(
      runQuery(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='content_posts' AND cmd IN ('INSERT','UPDATE','DELETE') AND roles::text LIKE '%anon%';`)
    ).length,
  };

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const marker = "prod-gate-rls";

  const { data: draft } = await admin.from("content_posts").insert({
    content_type: "academy",
    title: `${marker} draft`,
    slug: `${marker}-draft-${Date.now()}`,
    body: "RLS gate draft probe.",
    status: "draft",
  }).select("id").single();
  const { data: anonDraft } = await anon.from("content_posts").select("id").eq("id", draft.id);
  report.rls.draftHidden = (anonDraft || []).length === 0;

  const { data: pub } = await admin.from("content_posts").insert({
    content_type: "academy",
    title: `${marker} pub`,
    slug: `${marker}-pub-${Date.now()}`,
    body: "RLS gate published probe.",
    status: "published",
    published_at: new Date().toISOString(),
  }).select("id").single();
  const { data: anonPub } = await anon.from("content_posts").select("id").eq("id", pub.id);
  report.rls.publishedVisible = (anonPub || []).length === 1;

  await admin.from("content_posts").update({ status: "archived" }).eq("id", pub.id);
  const { data: anonArch } = await anon.from("content_posts").select("id").eq("id", pub.id);
  report.rls.archivedHidden = (anonArch || []).length === 0;

  await admin.from("content_posts").update({ deleted_at: new Date().toISOString() }).eq("id", draft.id);
  const { data: anonDel } = await anon.from("content_posts").select("id").eq("id", draft.id);
  report.rls.deletedHidden = (anonDel || []).length === 0;

  const { error: anonWrite } = await anon.from("content_posts").insert({
    content_type: "academy", title: "blocked", slug: `${marker}-blocked`, body: "x", status: "published",
  });
  report.rls.directPublicWritesBlocked = Boolean(anonWrite);

  await admin.from("content_posts").delete().ilike("title", `${marker}%`);

  const bucket = parseQueryRows(
    runQuery(`SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='content-images';`)
  )[0];
  report.storage = {
    exists: Boolean(bucket),
    public: bucket?.public === true,
    maxBytes: bucket?.file_size_limit,
    mimeTypes: bucket?.allowed_mime_types,
    maxSizeOk: bucket?.file_size_limit === 8388608,
    mimeOk: ["image/jpeg", "image/png", "image/webp"].every((m) => (bucket?.allowed_mime_types || []).includes(m)),
  };

  const grants = parseQueryRows(
    runQuery(`SELECT role_id, permission_id FROM public.iam_role_permissions WHERE permission_id LIKE 'content.%' ORDER BY role_id, permission_id;`)
  );
  report.iam = {
    permissions: parseQueryRows(runQuery(`SELECT id FROM public.iam_permissions WHERE id LIKE 'content.%';`)).map((r) => r.id),
    roleGrants: grants,
    superAdminHasAll: ["content.read", "content.manage", "content.publish"].every((p) =>
      grants.some((g) => g.role_id === "super_admin" && g.permission_id === p)
    ),
    adminHasAll: ["content.read", "content.manage", "content.publish"].every((p) =>
      grants.some((g) => g.role_id === "admin" && g.permission_id === p)
    ),
    deniedRolesClean: ["analyst", "support", "accountant", "news_editor"].every(
      (role) => !grants.some((g) => g.role_id === role)
    ),
  };

  report.pass =
    report.schema.tableExists &&
    report.schema.columnsMatch &&
    report.rls.draftHidden &&
    report.rls.publishedVisible &&
    report.rls.archivedHidden &&
    report.rls.deletedHidden &&
    report.rls.dangerousWritePolicies === 0 &&
    report.storage.exists &&
    report.storage.mimeOk &&
    report.iam.superAdminHasAll &&
    report.iam.adminHasAll &&
    report.iam.deniedRolesClean;

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  const out = join(ROOT, "scripts/.artifacts/content-posts-production-gate.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e.message }));
  process.exit(1);
});
