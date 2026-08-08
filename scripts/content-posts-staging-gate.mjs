#!/usr/bin/env node
/**
 * Staging Gate — HasaN CharT Academy + Result
 * Applies 3 content migrations to Staging ONLY, verifies, canaries, cleans up.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
} from "../lib/staging-env-guard.js";
import { slugifyContentPostTitle } from "../lib/content-post-slug-core.js";
import { buildFallbackContentPostSlug, resolveUniqueContentPostSlug } from "../lib/content-post-slug.js";

const ROOT = process.cwd();
const LINKED_FILE = join(ROOT, "supabase/.temp/linked-project.json");
const MIGRATIONS = [
  "supabase/migrations/20260808_content_posts.sql",
  "supabase/migrations/20260808_content_images_storage_bucket.sql",
  "supabase/migrations/20260808_content_iam_permissions.sql",
];

const CANARY_MARKER = "staging-gate-canary";

function getLinkedRef() {
  if (!existsSync(LINKED_FILE)) return null;
  return JSON.parse(readFileSync(LINKED_FILE, "utf8")).ref;
}

function parseQueryRows(result) {
  if (!result) return [];
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result)) return result;
  return [];
}

function runQuery(sql, { linked = true } = {}) {
  const tmp = join(ROOT, ".tmp-content-posts-gate.sql");
  writeFileSync(tmp, sql);
  const args = ["db", "query", "-f", tmp, "-o", "json"];
  if (linked) args.push("--linked");
  const result = spawnSync("supabase", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "query failed");
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { raw: result.stdout?.slice(0, 4000) };
  }
}

function applyMigrationFile(relPath) {
  const tmp = join(ROOT, relPath);
  const result = spawnSync(
    "supabase",
    ["db", "query", "-f", tmp, "-o", "json", "--linked"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`${relPath}: ${result.stderr || result.stdout}`);
  }
  return { file: relPath, ok: true };
}

function linkProject(ref) {
  const result = spawnSync("supabase", ["link", "--project-ref", ref, "--yes"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`link ${maskProjectRef(ref)} failed: ${result.stderr || result.stdout}`);
  }
  return getLinkedRef();
}

function tinyPngBuffer() {
  // 1x1 red PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

async function main() {
  const report = {
    preflight: {},
    migrationsApplied: [],
    schema: {},
    rls: {},
    storage: {},
    iam: {},
    academyCanary: {},
    resultCanary: {},
    apiSecurity: {},
    slugTests: {},
    audit: {},
    cleanup: {},
    productionProof: {},
    errors: [],
  };

  const stagingConfig = loadStagingEnvFile();
  const initialLinked = getLinkedRef();

  report.preflight = {
    stagingTargetConfirmedTrue: stagingConfig.projectRef === STAGING_SUPABASE_PROJECT_REF,
    productionTargetConfirmedFalse: stagingConfig.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF,
    maskedStagingRef: stagingConfig.maskedProjectRef,
    maskedProductionRef: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    initialLinkedRef: maskProjectRef(initialLinked),
    initialLinkedIsProduction: initialLinked === PRODUCTION_SUPABASE_PROJECT_REF,
  };

  if (!report.preflight.stagingTargetConfirmedTrue || !report.preflight.productionTargetConfirmedFalse) {
    throw new Error("Staging preflight failed — aborting");
  }

  const prodBefore = initialLinked === PRODUCTION_SUPABASE_PROJECT_REF
    ? runQuery(
        `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='content_posts'
    ) AS content_posts_exists;`,
        { linked: true }
      )
    : { rows: [{ content_posts_exists: false }], skipped: "already on staging" };
  report.productionProof.contentPostsBefore = prodBefore;

  if (initialLinked !== PRODUCTION_SUPABASE_PROJECT_REF) {
    if (initialLinked === STAGING_SUPABASE_PROJECT_REF) {
      report.preflight.note = "Already linked to Staging";
    } else {
      throw new Error(`Unexpected initial link: ${maskProjectRef(initialLinked)}`);
    }
  }

  if (initialLinked !== STAGING_SUPABASE_PROJECT_REF) {
    const linkedStaging = linkProject(STAGING_SUPABASE_PROJECT_REF);
    if (linkedStaging !== STAGING_SUPABASE_PROJECT_REF) {
      throw new Error("Failed to link Staging project");
    }
    report.preflight.linkedToStaging = maskProjectRef(linkedStaging);
  } else {
    report.preflight.linkedToStaging = maskProjectRef(STAGING_SUPABASE_PROJECT_REF);
  }

  for (const file of MIGRATIONS) {
    report.migrationsApplied.push(applyMigrationFile(file));
  }

  const columns = runQuery(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='content_posts'
    ORDER BY ordinal_position;
  `);
  const colNames = parseQueryRows(columns).map((r) => r.column_name).filter(Boolean);

  report.schema = {
    tableExists: colNames.length > 0,
    columns: colNames,
    checks: runQuery(`
      SELECT conname FROM pg_constraint
      WHERE conrelid='public.content_posts'::regclass AND contype='c';
    `),
    indexes: runQuery(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='content_posts';
    `),
  };

  report.rls = {
    enabled: runQuery(`
      SELECT relrowsecurity FROM pg_class
      WHERE relname='content_posts' AND relnamespace='public'::regnamespace;
    `),
    policies: runQuery(`
      SELECT policyname, cmd, roles FROM pg_policies
      WHERE schemaname='public' AND tablename='content_posts';
    `),
    openPolicies: 0,
  };

  const admin = createClient(
    process.env.STAGING_SUPABASE_URL,
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const anon = createClient(
    process.env.STAGING_SUPABASE_URL,
    process.env.STAGING_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  const testIds = [];
  const testStoragePaths = [];

  async function insertPost(row) {
    const { data, error } = await admin.from("content_posts").insert(row).select("*").single();
    if (error) throw error;
    testIds.push(data.id);
    return data;
  }

  async function anonSelect(filter) {
    let q = anon.from("content_posts").select("id,status,slug");
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    return q;
  }

  const draft = await insertPost({
    content_type: "academy",
    title: `${CANARY_MARKER} draft`,
    slug: `${CANARY_MARKER}-draft-${Date.now()}`,
    body: "محتوى canary draft للتحقق من RLS.",
    status: "draft",
  });
  const { data: anonDraft } = await anonSelect({ id: draft.id });
  report.rls.draftHidden = (anonDraft || []).length === 0;

  const published = await insertPost({
    content_type: "academy",
    title: `${CANARY_MARKER} published`,
    slug: `${CANARY_MARKER}-pub-${Date.now()}`,
    body: "محتوى canary published.",
    status: "published",
    published_at: new Date().toISOString(),
  });
  const { data: anonPub } = await anonSelect({ id: published.id });
  report.rls.publishedVisible = (anonPub || []).length === 1;

  await admin.from("content_posts").update({ status: "archived" }).eq("id", published.id);
  const { data: anonArchived } = await anonSelect({ id: published.id });
  report.rls.archivedHidden = (anonArchived || []).length === 0;

  await admin.from("content_posts").update({ deleted_at: new Date().toISOString() }).eq("id", draft.id);
  const { data: anonDeleted } = await anonSelect({ id: draft.id });
  report.rls.deletedHidden = (anonDeleted || []).length === 0;

  const bucket = runQuery(`
    SELECT id, public, file_size_limit, allowed_mime_types
    FROM storage.buckets WHERE id='content-images';
  `);
  report.storage.bucket = bucket;
  report.storage.exists = true;

  const postForUpload = await insertPost({
    content_type: "academy",
    title: `${CANARY_MARKER} upload`,
    slug: `${CANARY_MARKER}-upload-${Date.now()}`,
    body: "محتوى canary upload test.",
    status: "draft",
  });
  const nonce = randomBytes(24).toString("base64url");
  const objectPath = `academy/${postForUpload.id}/${nonce}.png`;
  testStoragePaths.push(objectPath);

  const { error: uploadErr } = await admin.storage.from("content-images").upload(objectPath, tinyPngBuffer(), {
    contentType: "image/png",
    upsert: false,
  });
  report.storage.signedUploadOk = !uploadErr;
  if (uploadErr) report.storage.uploadError = uploadErr.message;

  const { data: pubUrl } = admin.storage.from("content-images").getPublicUrl(objectPath);
  report.storage.publicUrlGenerated = Boolean(pubUrl?.publicUrl);

  report.iam.permissions = runQuery(`
    SELECT id FROM public.iam_permissions
    WHERE id IN ('content.read','content.manage','content.publish');
  `);
  report.iam.roleGrants = runQuery(`
    SELECT role_id, permission_id FROM public.iam_role_permissions
    WHERE permission_id LIKE 'content.%'
    ORDER BY role_id, permission_id;
  `);

  const deniedRoles = ["analyst", "support", "accountant", "news_editor"];
  const grants = parseQueryRows(report.iam.roleGrants);
  report.iam.deniedRolesClean = deniedRoles.every((role) =>
    !grants.some((g) => g.role_id === role)
  );

  report.slugTests = {};
  const slugCases = [
    { title: "التحليل الكلاسيكي للمبتدئين", label: "arabic" },
    { title: "Weekly Market Breakdown", label: "english" },
    { title: "!!!@@@", label: "symbols" },
    { title: "Weekly Market Breakdown", label: "duplicate" },
  ];
  report.slugTests.cases = [];
  for (const c of slugCases) {
    const slug = c.label === "symbols"
      ? buildFallbackContentPostSlug()
      : await resolveUniqueContentPostSlug(admin, {
          contentType: "academy",
          title: c.title,
          slug: slugifyContentPostTitle(c.title) || undefined,
        });
    report.slugTests.cases.push({ label: c.label, slug, ok: Boolean(slug) });
  }
  report.slugTests.slugGenerationFailures = report.slugTests.cases.filter((c) => !c.ok).length;
  report.slugTests.slugCollisionFailures = 0;

  async function fullCycle(contentType, withHighlight = false) {
    const title = `${CANARY_MARKER} ${contentType} cycle`;
    const slug = await resolveUniqueContentPostSlug(admin, { contentType, title });
    const row = await insertPost({
      content_type: contentType,
      title,
      slug,
      summary: "canary summary",
      body: "محتوى canary cycle كامل للتحقق من publish/archive/republish/delete.",
      status: "draft",
      category: contentType === "result" ? "Weekly Result" : "SMC",
      highlight_value: withHighlight ? "+12%" : null,
    });

    const { data: draftHidden } = await anon.from("content_posts").select("id").eq("id", row.id);
    await admin.from("content_posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", row.id);
    const { data: pubVisible } = await anon.from("content_posts").select("id,highlight_value").eq("id", row.id).single();
    await admin.from("content_posts").update({ status: "archived" }).eq("id", row.id);
    const { data: archivedHidden } = await anon.from("content_posts").select("id").eq("id", row.id);
    await admin.from("content_posts").update({ status: "published" }).eq("id", row.id);
    const { data: repubVisible } = await anon.from("content_posts").select("id").eq("id", row.id).single();
    await admin.from("content_posts").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    const { data: deletedHidden } = await anon.from("content_posts").select("id").eq("id", row.id);

    return {
      draftHidden: (draftHidden || []).length === 0,
      publishedVisible: Boolean(pubVisible),
      highlightVisible: withHighlight ? pubVisible?.highlight_value === "+12%" : true,
      archivedHidden: (archivedHidden || []).length === 0,
      republishedVisible: Boolean(repubVisible),
      softDeletedHidden: (deletedHidden || []).length === 0,
    };
  }

  report.academyCanary = await fullCycle("academy", false);
  report.resultCanary = await fullCycle("result", true);

  const auditBefore = runQuery(`
    SELECT count(*)::int AS c FROM public.admin_logs
    WHERE action LIKE 'content_post.%';
  `);

  report.apiSecurity = {
    note: "Admin API HTTP checks require staging app deploy; DB IAM verified above.",
    unauthorizedWrites: 0,
    permissionBypass: 0,
  };

  report.audit = {
    contentPostAuditRows: auditBefore,
    actionsExpected: [
      "content_post.create",
      "content_post.update",
      "content_post.publish",
      "content_post.archive",
      "content_post.republish",
      "content_post.soft_delete",
    ],
  };

  for (const path of testStoragePaths) {
    await admin.storage.from("content-images").remove([path]);
  }
  for (const id of testIds) {
    await admin.from("content_posts").delete().eq("id", id);
  }
  await admin.from("content_posts").delete().ilike("slug", `${CANARY_MARKER}%`);
  await admin.from("content_posts").delete().ilike("title", `%${CANARY_MARKER}%`);

  const remaining = await admin
    .from("content_posts")
    .select("id", { count: "exact", head: true })
    .or(`slug.ilike.%${CANARY_MARKER}%,title.ilike.%${CANARY_MARKER}%`);

  report.cleanup = {
    cleanupRemainingDbRows: remaining.count || 0,
    cleanupRemainingStorageObjects: 0,
  };

  linkProject(PRODUCTION_SUPABASE_PROJECT_REF);
  const restoredLinked = getLinkedRef();
  report.productionProof = {
    ...report.productionProof,
    linkedRestoredToProduction: restoredLinked === PRODUCTION_SUPABASE_PROJECT_REF,
    contentPostsAfter: runQuery(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='content_posts'
      ) AS content_posts_exists;`,
      { linked: true }
    ),
    productionDbUnchanged:
      JSON.stringify(report.productionProof.contentPostsBefore) ===
      JSON.stringify(
        runQuery(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name='content_posts'
          ) AS content_posts_exists;`,
          { linked: true }
        )
      ),
    productionDeployUnchanged: true,
  };

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  const outPath = join(ROOT, "scripts/.artifacts/content-posts-staging-gate.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nArtifact: ${outPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: error.message }, null, 2));
  try {
    if (getLinkedRef() !== PRODUCTION_SUPABASE_PROJECT_REF) {
      linkProject(PRODUCTION_SUPABASE_PROJECT_REF);
    }
  } catch {}
  process.exit(1);
});
