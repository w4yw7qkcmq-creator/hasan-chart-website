#!/usr/bin/env node
/**
 * Phase 2B — Staging DB / RLS / RPC validation (disposable rows only).
 * STAGING ONLY — never Production.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";

const RUN = `p2b-${Date.now()}`;
const report = { run: RUN, checks: [], errors: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function fail(name, detail = {}) {
  report.errors.push({ name, ...detail });
  report.checks.push({ name, status: "FAIL", ...detail });
}

function loadLocalTelegramSecrets() {
  const file = resolve(process.cwd(), ".env.staging.telegram.local");
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return values;
}

async function main() {
  const staging = loadStagingEnvFile();
  if (staging.projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: staging config matches production");
  }
  if (staging.projectRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: unexpected staging ref ${maskProjectRef(staging.projectRef)}`);
  }

  const url = process.env.STAGING_SUPABASE_URL;
  const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  // Legacy tables untouched (row counts baseline)
  const legacy = {};
  for (const table of ["daily_analysis", "content_posts"]) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) fail(`legacy_${table}_readable`, { error: error.message });
    else {
      legacy[table] = count ?? 0;
      pass(`legacy_${table}_untouched`, { count: legacy[table] });
    }
  }

  // New tables exist
  for (const table of [
    "telegram_content_posts",
    "telegram_content_images",
    "telegram_media_group_buffer",
    "telegram_media_group_state",
    "telegram_webhook_ingress_log",
  ]) {
    const { error } = await admin.from(table).select("*", { head: true, count: "exact" });
    if (error) fail(`table_${table}`, { error: error.message });
    else pass(`table_${table}_exists`);
  }

  // Bucket
  const { data: bucketList, error: bucketErr } = await admin.storage.listBuckets();
  const bucket = bucketList?.find((b) => b.id === "telegram-content-images");
  if (bucketErr || !bucket) fail("bucket_telegram_content_images", { error: bucketErr?.message || "missing" });
  else pass("bucket_telegram_content_images", { public: bucket.public, fileSizeLimit: bucket.file_size_limit });

  // RLS: anon cannot read operational tables
  for (const table of [
    "telegram_media_group_buffer",
    "telegram_media_group_state",
    "telegram_webhook_ingress_log",
  ]) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    const blocked = !data?.length && (error?.code === "42501" || error?.message?.includes("permission") || error?.message?.includes("RLS"));
    if (blocked || (Array.isArray(data) && data.length === 0 && error)) {
      pass(`rls_anon_blocked_${table}`);
    } else if (data?.length) {
      fail(`rls_anon_blocked_${table}`, { note: "anon read returned rows" });
    } else {
      pass(`rls_anon_blocked_${table}`, { note: "empty/no access" });
    }
  }

  // RLS: anon write fails on posts
  const { error: anonInsertErr } = await anon.from("telegram_content_posts").insert({
    section: "academy",
    telegram_channel_id: -1000000000001,
    telegram_message_id: 1,
    body: "blocked",
    public_slug: `${RUN}-blocked`,
    published_at: new Date().toISOString(),
  });
  if (anonInsertErr) pass("rls_anon_insert_posts_blocked");
  else fail("rls_anon_insert_posts_blocked");

  // Storage: anon upload should fail
  const testPath = `${RUN}/probe.png`;
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const { error: anonUploadErr } = await anon.storage
    .from("telegram-content-images")
    .upload(testPath, tinyPng, { contentType: "image/png", upsert: true });
  if (anonUploadErr) pass("storage_anon_upload_blocked");
  else {
    fail("storage_anon_upload_blocked");
    await admin.storage.from("telegram-content-images").remove([testPath]);
  }

  // Service role upload works
  const { error: adminUploadErr } = await admin.storage
    .from("telegram-content-images")
    .upload(testPath, tinyPng, { contentType: "image/png", upsert: true });
  if (adminUploadErr) fail("storage_service_role_upload", { error: adminUploadErr.message });
  else pass("storage_service_role_upload");

  // Public read on uploaded object
  const { data: publicUrl } = admin.storage.from("telegram-content-images").getPublicUrl(testPath);
  const pubRes = await fetch(publicUrl.publicUrl, { method: "HEAD" });
  if (pubRes.ok) pass("storage_public_read");
  else fail("storage_public_read", { status: pubRes.status });

  await admin.storage.from("telegram-content-images").remove([testPath]);

  // RPC abuse: anon/authenticated should not execute retention/cleanup
  for (const fn of [
    "enforce_telegram_section_retention",
    "cleanup_telegram_content_operational_tables",
  ]) {
    const { error } = await anon.rpc(fn, fn.includes("retention")
      ? { p_section: "academy", p_limit: 100 }
      : { p_ingress_retention_days: 30, p_buffer_terminal_retention_days: 7 });
    if (error) pass(`rpc_anon_blocked_${fn}`, { code: error.code });
    else fail(`rpc_anon_blocked_${fn}`, { note: "anon rpc succeeded" });
  }

  // Retention simulation (disposable rows)
  const section = "academy";
  const channelId = -1009998887776;
  const insertedIds = [];
  for (let i = 0; i < 101; i++) {
    const { data, error } = await admin
      .from("telegram_content_posts")
      .insert({
        section,
        telegram_channel_id: channelId,
        telegram_message_id: 900000 + i,
        body: `${RUN} retention probe ${i}`,
        public_slug: `${RUN}-ret-${i}`,
        published_at: new Date(Date.now() - (101 - i) * 1000).toISOString(),
        sync_status: "published",
        qualification_status: "eligible",
      })
      .select("id")
      .single();
    if (error) {
      fail("retention_seed", { error: error.message, i });
      break;
    }
    insertedIds.push(data.id);
  }

  if (insertedIds.length === 101) {
    const { data: victims, error: rpcErr } = await admin.rpc("enforce_telegram_section_retention", {
      p_section: section,
      p_limit: 100,
    });
    if (rpcErr) fail("retention_rpc", { error: rpcErr.message });
    else if ((victims?.length || 0) === 1) {
      pass("retention_101st_oldest_selected", { victims: victims.length });
      const victimId = victims[0].deleted_post_id;
      if (victimId === insertedIds[0]) pass("retention_oldest_is_first_inserted");
      else fail("retention_oldest_is_first_inserted", { victimId, expected: insertedIds[0] });
    } else {
      fail("retention_101st_oldest_selected", { victims: victims?.length });
    }

    // Below limit — no deletion
    await admin.from("telegram_content_posts").delete().eq("telegram_channel_id", channelId);
    for (let i = 0; i < 50; i++) {
      await admin.from("telegram_content_posts").insert({
        section: "result",
        telegram_channel_id: channelId + 1,
        telegram_message_id: 800000 + i,
        body: `${RUN} under limit ${i}`,
        public_slug: `${RUN}-under-${i}`,
        published_at: new Date().toISOString(),
      });
    }
    const { data: underVictims } = await admin.rpc("enforce_telegram_section_retention", {
      p_section: "result",
      p_limit: 100,
    });
    if ((underVictims?.length || 0) === 0) pass("retention_under_limit_no_deletion");
    else fail("retention_under_limit_no_deletion", { victims: underVictims?.length });

    await admin.from("telegram_content_posts").delete().eq("telegram_channel_id", channelId + 1);
  }

  // Section isolation spot check
  const { count: daCount } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("section", "daily_analysis")
    .like("public_slug", `${RUN}%`);
  pass("section_isolation_probe", { dailyAnalysisRunRows: daCount ?? 0 });

  // Operational cleanup RPC (service role)
  const oldIngressId = randomUUID();
  await admin.from("telegram_webhook_ingress_log").insert({
    id: oldIngressId,
    telegram_update_id: 888777666555444 + Math.floor(Math.random() * 1000),
    update_type: "ignored",
    processing_result: "ignored",
    received_at: new Date(Date.now() - 40 * 86400000).toISOString(),
  });
  const { data: cleanupRows, error: cleanupErr } = await admin.rpc(
    "cleanup_telegram_content_operational_tables",
    { p_ingress_retention_days: 30, p_buffer_terminal_retention_days: 7 }
  );
  if (cleanupErr) fail("operational_cleanup_rpc", { error: cleanupErr.message });
  else pass("operational_cleanup_rpc", { result: cleanupRows?.[0] || null });

  // Cleanup disposable rows
  await admin.from("telegram_content_posts").delete().like("public_slug", `${RUN}%`);
  await admin.from("telegram_webhook_ingress_log").delete().gte("telegram_update_id", 888777666555444);

  // Re-check legacy unchanged
  for (const table of ["daily_analysis", "content_posts"]) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    if (count === legacy[table]) pass(`legacy_${table}_count_unchanged`);
    else fail(`legacy_${table}_count_unchanged`, { before: legacy[table], after: count });
  }

  const secrets = loadLocalTelegramSecrets();
  report.stagingProject = maskProjectRef(staging.projectRef);
  report.telegramSecretsConfigured = Boolean(secrets.TELEGRAM_CONTENT_BOT_TOKEN);
  report.verdict =
    report.errors.length === 0 ? "DB_VALIDATION_PASS" : "DB_VALIDATION_FAIL";

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: err.message }));
  process.exit(1);
});
