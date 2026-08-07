#!/usr/bin/env node
/**
 * Staging canary for Academy + Result content posts.
 * Requires STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.CONTENT_POSTS_TEST_BASE || "http://127.0.0.1:3000";

if (!url || !key) {
  console.log(JSON.stringify({ skipped: true, reason: "missing staging supabase env" }, null, 2));
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const createdIds = [];

async function createDraft(contentType, title) {
  const { data, error } = await supabase
    .from("content_posts")
    .insert({
      content_type: contentType,
      title,
      slug: `${contentType}-canary-${Date.now()}`,
      body: "محتوى اختبار canary للتحقق من دورة النشر والأرشفة.",
      summary: "ملخص canary",
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  createdIds.push(data.id);
  return data;
}

async function publish(id) {
  const { error } = await supabase
    .from("content_posts")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function archive(id) {
  const { error } = await supabase.from("content_posts").update({ status: "archived" }).eq("id", id);
  if (error) throw error;
}

async function fetchPublic(path) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, ok: response.ok };
}

async function cleanup() {
  for (const id of createdIds) {
    await supabase.from("content_posts").delete().eq("id", id);
  }
}

async function runCycle(contentType, publicListPath, publicDetailPathBuilder) {
  const draft = await createDraft(contentType, `Canary ${contentType}`);
  const publicDraft = await fetchPublic(publicDetailPathBuilder(draft.slug));
  await publish(draft.id);
  const publicPublished = await fetchPublic(publicDetailPathBuilder(draft.slug));
  await archive(draft.id);
  const publicArchived = await fetchPublic(publicDetailPathBuilder(draft.slug));
  await publish(draft.id);
  const publicRepublished = await fetchPublic(publicDetailPathBuilder(draft.slug));
  const list = await fetchPublic(publicListPath);

  return {
    contentType,
    draftHidden: publicDraft.status === 404,
    publishedVisible: publicPublished.ok,
    archivedHidden: publicArchived.status === 404,
    republishedVisible: publicRepublished.ok,
    listOk: list.ok,
  };
}

async function main() {
  const report = {
    academy: null,
    result: null,
    cleanup: false,
  };

  try {
    report.academy = await runCycle("academy", "/academy", (slug) => `/academy/${slug}`);
    report.result = await runCycle("result", "/results", (slug) => `/results/${slug}`);
    await cleanup();
    report.cleanup = true;
  } catch (error) {
    report.error = error.message;
    try {
      await cleanup();
      report.cleanup = true;
    } catch {}
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.error) process.exit(1);
}

main();
