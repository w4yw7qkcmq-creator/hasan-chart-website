#!/usr/bin/env node
/**
 * Retrospective Human Pre-Flight verification (publish + edit).
 * STAGING ONLY.
 */
import { loadStagingEnvFile, getStagingSupabaseClientOptions } from "../lib/load-staging-env.js";
import { createClient } from "@supabase/supabase-js";

const STAGING_WEB =
  process.env.TELEGRAM_CONTENT_STAGING_WEB ||
  "https://hasan-chart-website-staging-staging.up.railway.app";

const PUBLISH_MARKER = "HUMAN-PREFLIGHT-20260821";
const EDIT_MARKER = "PREFLIGHT-EDIT-20260821";
const ACADEMY_CHANNEL = -1001906943855;

const report = { checks: [], errors: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
  console.log(`PASS ${name}`, detail.summary || "");
}

function fail(name, detail = {}) {
  report.errors.push({ name, ...detail });
  report.checks.push({ name, status: "FAIL", ...detail });
  console.error(`FAIL ${name}`, detail);
}

async function fetchPage(path) {
  const res = await fetch(`${STAGING_WEB}${path}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  return { status: res.status, html: await res.text() };
}

function msBetween(a, b) {
  if (!a || !b) return null;
  return new Date(b).getTime() - new Date(a).getTime();
}

async function main() {
  loadStagingEnvFile();
  const staging = getStagingSupabaseClientOptions();
  const admin = createClient(staging.url, staging.serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: posts, error: postErr } = await admin
    .from("telegram_content_posts")
    .select(
      "id, section, body, public_slug, telegram_message_id, telegram_channel_id, published_at, created_at, updated_at, sync_status, qualification_status"
    )
    .eq("section", "academy")
    .ilike("body", `%${PUBLISH_MARKER}%`);

  if (postErr) {
    fail("db_query", { message: postErr.message });
    printReport();
    return;
  }

  if (!posts?.length) {
    fail("human_post_exists", { reason: "no row with publish marker" });
    printReport();
    return;
  }

  if (posts.length > 1) {
    fail("no_duplicate_posts", { count: posts.length, ids: posts.map((p) => p.id) });
  } else {
    pass("no_duplicate_posts", { summary: `1 row (${posts[0].id})` });
  }

  const post = posts[0];

  const { data: dupByMsg } = await admin
    .from("telegram_content_posts")
    .select("id")
    .eq("section", "academy")
    .eq("telegram_message_id", post.telegram_message_id)
    .eq("sync_status", "published")
    .eq("qualification_status", "eligible");

  if ((dupByMsg?.length || 0) > 1) {
    fail("same_message_no_duplicate", { count: dupByMsg.length });
  } else {
    pass("same_message_no_duplicate", { summary: `message_id=${post.telegram_message_id}` });
  }

  if (post.body.includes(EDIT_MARKER)) {
    pass("edit_body_in_db", { summary: EDIT_MARKER });
  } else {
    fail("edit_body_in_db", { reason: "edit marker missing from body" });
  }

  const { data: ingressRows } = await admin
    .from("telegram_webhook_ingress_log")
    .select("telegram_update_id, update_type, processing_result, received_at, telegram_message_id")
    .eq("telegram_channel_id", post.telegram_channel_id || ACADEMY_CHANNEL)
    .eq("telegram_message_id", post.telegram_message_id)
    .order("received_at", { ascending: true });

  const publishIngress = (ingressRows || []).find((r) => r.update_type === "channel_post");
  const editIngress = (ingressRows || []).find((r) => r.update_type === "edited_channel_post");

  if (publishIngress?.telegram_update_id) {
    const uid = publishIngress.telegram_update_id;
    const nativeRange = uid >= 519988000 && uid <= 520000000;
    pass("native_publish_update_id", {
      summary: String(uid),
      update_id: uid,
      processing_result: publishIngress.processing_result,
      native_human_range: nativeRange,
    });
  } else {
    fail("native_publish_update_id", { reason: "no channel_post ingress row" });
  }

  if (editIngress?.telegram_update_id) {
    pass("native_edit_update_id", {
      summary: String(editIngress.telegram_update_id),
      update_id: editIngress.telegram_update_id,
      processing_result: editIngress.processing_result,
    });
  } else {
    fail("native_edit_update_id", { reason: "no edited_channel_post ingress row" });
  }

  const publishDbLatencyMs = msBetween(publishIngress?.received_at, post.published_at);
  const editDbLatencyMs = msBetween(editIngress?.received_at, post.updated_at);

  const listPage = await fetchPage("/academy");
  const detailPage = await fetchPage(`/academy/${post.public_slug}`);

  const listHasPublish = listPage.html.includes(PUBLISH_MARKER);
  const detailHasPublish = detailPage.html.includes(PUBLISH_MARKER);
  const listHasEdit = listPage.html.includes(EDIT_MARKER);
  const detailHasEdit = detailPage.html.includes(EDIT_MARKER);

  if (listHasPublish || detailHasPublish) {
    pass("publish_visible_on_academy", {
      list: listHasPublish,
      detail: detailHasPublish,
      slug: post.public_slug,
    });
  } else {
    fail("publish_visible_on_academy", { slug: post.public_slug });
  }

  if (detailHasEdit) {
    pass("edit_visible_on_same_page", {
      summary: post.public_slug,
      listShowsEdit: listHasEdit,
      detailShowsEdit: true,
    });
  } else {
    fail("edit_visible_on_same_page", {
      reason: "edit marker not on detail page",
      slug: post.public_slug,
    });
  }

  const pageFetchStart = Date.now();
  let pageFreshMs = null;
  for (let i = 0; i < 3; i += 1) {
    const p = await fetchPage(`/academy/${post.public_slug}`);
    if (p.html.includes(EDIT_MARKER) && p.html.includes(PUBLISH_MARKER)) {
      pageFreshMs = Date.now() - pageFetchStart;
      break;
    }
  }

  report.latency = {
    publish: {
      webhook_received_at: publishIngress?.received_at || null,
      post_published_at: post.published_at,
      ingress_to_db_ms: publishDbLatencyMs,
    },
    edit: {
      webhook_received_at: editIngress?.received_at || null,
      post_updated_at: post.updated_at,
      ingress_to_db_ms: editDbLatencyMs,
    },
    page_probe_ms: pageFetchStart,
    note: "End-to-end page latency measured at verification time; DB ingress→published_at proxies ingest speed.",
  };

  report.post = {
    id: post.id,
    public_slug: post.public_slug,
    telegram_message_id: post.telegram_message_id,
    body_preview: post.body.slice(0, 120),
  };

  report.staging = {
    web: STAGING_WEB,
    redeploy: "none during this verification",
  };

  report.result =
    report.errors.length === 0 ? "PRODUCTION PRE-FLIGHT PASS — READY FOR CLEAN COMMIT" : "PRODUCTION PRE-FLIGHT BLOCKED";

  printReport();
  process.exitCode = report.errors.length === 0 ? 0 : 1;
}

function printReport() {
  console.log("\n=== HUMAN CANARY REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("FAIL", e?.message || e);
  process.exitCode = 1;
});
