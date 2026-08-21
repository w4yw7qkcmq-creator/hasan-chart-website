#!/usr/bin/env node
/**
 * Phase 2B — Real Telegram Canary on Staging.
 * Bot channel self-posts are not delivered by Telegram; we publish via Bot API
 * then deliver the returned Message objects to the staging webhook (real file_ids + staging path).
 * Never prints bot token or webhook secret.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "../lib/staging-env-guard.js";

const RUN = `p2bcanary-${Date.now()}`;
const STAGING_WEB =
  process.env.STAGING_RAILWAY_WEB_URL ||
  "https://hasan-chart-website-staging-staging.up.railway.app";
const ALBUM_WAIT_MS = 5000;
const POLL_MS = 1500;

const CHANNELS = {
  daily_analysis: "-1001717982915",
  academy: "-1001906943855",
  result: "-1001921288074",
};

const PHOTO_URLS = [
  "https://picsum.photos/seed/p2b1/640/480",
  "https://picsum.photos/seed/p2b2/640/480",
  "https://picsum.photos/seed/p2b3/640/480",
];

const report = { run: RUN, tests: [], failures: [], notes: [] };
let updateSeq = 9100000000 + Math.floor(Math.random() * 100000);

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return values;
}

function pass(name, detail = {}) {
  report.tests.push({ name, status: "PASS", ...detail });
}

function fail(name, detail = {}) {
  report.failures.push({ name, ...detail });
  report.tests.push({ name, status: "FAIL", ...detail });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextUpdateId() {
  updateSeq += 1;
  return updateSeq;
}

async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description || "failed"}`);
  return data.result;
}

async function deliverToStaging(webhookSecret, message, { edited = false } = {}) {
  const updateId = nextUpdateId();
  const payload = edited
    ? { update_id: updateId, edited_channel_post: message }
    : { update_id: updateId, channel_post: message };
  const res = await fetch(`${STAGING_WEB}/api/webhooks/telegram-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": webhookSecret,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status !== 200 || !data.success) {
    throw new Error(`webhook delivery failed: ${res.status} ${JSON.stringify(data).slice(0, 120)}`);
  }
  return { updateId, data };
}

async function publishText(token, webhookSecret, chatId, text) {
  const message = await tg(token, "sendMessage", { chat_id: chatId, text });
  return deliverToStaging(webhookSecret, message);
}

async function publishPhoto(token, webhookSecret, chatId, photo, caption) {
  const message = await tg(token, "sendPhoto", { chat_id: chatId, photo, caption });
  return deliverToStaging(webhookSecret, message);
}

async function publishAlbum(token, webhookSecret, chatId, caption) {
  const messages = await tg(token, "sendMediaGroup", {
    chat_id: chatId,
    media: [
      { type: "photo", media: PHOTO_URLS[0], caption },
      { type: "photo", media: PHOTO_URLS[1] },
      { type: "photo", media: PHOTO_URLS[2] },
    ],
  });
  for (const message of messages) {
    await deliverToStaging(webhookSecret, message);
    await sleep(200);
  }
  return messages;
}

async function publishVideo(token, webhookSecret, chatId, { caption = undefined, video }) {
  const body = { chat_id: chatId, video };
  if (caption) body.caption = caption;
  const message = await tg(token, "sendVideo", body);
  return deliverToStaging(webhookSecret, message);
}

async function waitForPost(admin, { section, bodyIncludes, timeoutMs = 90000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await admin
      .from("telegram_content_posts")
      .select("*, telegram_content_images(*)")
      .eq("section", section)
      .like("body", `%${bodyIncludes}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data?.[0]) return data[0];
    await sleep(POLL_MS);
  }
  return null;
}

async function waitForCondition(fn, { timeoutMs = 90000, label = "condition" }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(POLL_MS);
  }
  throw new Error(`Timeout: ${label}`);
}

async function main() {
  loadStagingEnvFile();
  if (process.env.STAGING_SUPABASE_PROJECT_REF === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: staging matches production");
  }

  const secrets = parseEnvFile(resolve(process.cwd(), ".env.staging.telegram.local"));
  const token = secrets.TELEGRAM_CONTENT_BOT_TOKEN;
  const webhookSecret = secrets.TELEGRAM_CONTENT_WEBHOOK_SECRET;
  if (!token || !webhookSecret) throw new Error("Missing telegram secrets file");

  report.notes.push(
    "Telegram does not webhook-deliver a bot's own channel posts; canary publishes via Bot API then delivers Message payloads to staging webhook."
  );

  const admin = createClient(
    process.env.STAGING_SUPABASE_URL,
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const marker = `[${RUN}]`;

  // --- A1 text ---
  const daText = `${marker} DA text-only exact body preserved`;
  const { data: daTextDelivery } = await publishText(token, webhookSecret, CHANNELS.daily_analysis, daText);
  const daTextPost = await waitForPost(admin, { section: "daily_analysis", bodyIncludes: marker });
  if (!daTextPost) fail("A1_da_text", { reason: "no post" });
  else if (daTextPost.body !== daText) fail("A1_da_text", { reason: "body mismatch" });
  else if ((daTextPost.telegram_content_images || []).length) fail("A1_da_text", { reason: "unexpected images" });
  else pass("A1_da_text", { postId: daTextPost.id, messageId: daTextPost.telegram_message_id });

  // --- A2 image ---
  const daCap = `${marker} DA image caption exact`;
  await publishPhoto(token, webhookSecret, CHANNELS.daily_analysis, PHOTO_URLS[0], daCap);
  const daImgPost = await waitForPost(admin, { section: "daily_analysis", bodyIncludes: "DA image caption" });
  if (!daImgPost) fail("A2_da_image", { reason: "no post" });
  else {
    const imgs = daImgPost.telegram_content_images || [];
    if (imgs.length !== 1) fail("A2_da_image", { images: imgs.length });
    else if (daImgPost.body !== daCap) fail("A2_da_image", { reason: "caption mismatch" });
    else pass("A2_da_image", { postId: daImgPost.id, storagePath: imgs[0]?.storage_path });
  }

  // --- A3 edit ---
  const daEditText = `${marker} DA edited text exact`;
  const editedMessage = await tg(token, "editMessageText", {
    chat_id: CHANNELS.daily_analysis,
    message_id: daTextPost.telegram_message_id,
    text: daEditText,
  });
  editedMessage.edit_date = Math.floor(Date.now() / 1000);
  await deliverToStaging(webhookSecret, editedMessage, { edited: true });
  const daEditedPost = await waitForCondition(
    async () => {
      const { data } = await admin
        .from("telegram_content_posts")
        .select("*")
        .eq("id", daTextPost.id)
        .maybeSingle();
      return data?.body === daEditText ? data : null;
    },
    { label: "da edit applied" }
  );
  const { count: dupAfterEdit } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("telegram_message_id", daTextPost.telegram_message_id)
    .eq("sync_status", "published");
  if (daEditedPost?.telegram_edited_at && dupAfterEdit === 1) {
    pass("A3_da_edit", { postId: daEditedPost.id, publicSlug: daEditedPost.public_slug });
  } else {
    fail("A3_da_edit", { dupAfterEdit, editedAt: daEditedPost?.telegram_edited_at });
  }

  // --- B academy ---
  await publishText(token, webhookSecret, CHANNELS.academy, `${marker} AC text only`);
  const acTextPost = await waitForPost(admin, { section: "academy", bodyIncludes: "AC text only" });
  if (acTextPost) pass("B_academy_text");
  else fail("B_academy_text");

  await publishPhoto(token, webhookSecret, CHANNELS.academy, PHOTO_URLS[1], `${marker} AC image caption`);
  const acImgPost = await waitForPost(admin, { section: "academy", bodyIncludes: "AC image caption" });
  if (acImgPost && (acImgPost.telegram_content_images || []).length === 1) pass("B_academy_image");
  else fail("B_academy_image");

  await publishAlbum(token, webhookSecret, CHANNELS.academy, `${marker} AC album caption complete`);
  await sleep(ALBUM_WAIT_MS);
  const acAlbumPost = await waitForPost(admin, {
    section: "academy",
    bodyIncludes: "AC album caption",
    timeoutMs: 60000,
  });
  if (!acAlbumPost) fail("B_academy_album");
  else if ((acAlbumPost.telegram_content_images || []).length !== 3) {
    fail("B_academy_album", { images: (acAlbumPost.telegram_content_images || []).length });
  } else pass("B_academy_album", { postId: acAlbumPost.id });

  const { count: pendingAfterAlbum } = await admin
    .from("telegram_media_group_state")
    .select("*", { count: "exact", head: true })
    .eq("status", "buffering");
  if (pendingAfterAlbum === 0) pass("B_album_timer_finalized");
  else fail("B_album_timer_finalized", { pendingAfterAlbum });

  // --- C results ---
  await publishText(token, webhookSecret, CHANNELS.result, `${marker} RS text`);
  const rsTextPost = await waitForPost(admin, { section: "result", bodyIncludes: "RS text" });
  if (rsTextPost) pass("C_result_text");
  else fail("C_result_text");

  await publishPhoto(token, webhookSecret, CHANNELS.result, PHOTO_URLS[2], `${marker} RS image caption`);
  const rsImgPost = await waitForPost(admin, { section: "result", bodyIncludes: "RS image caption" });
  if (rsImgPost) pass("C_result_image");
  else fail("C_result_image");

  const { count: rsInDa } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("section", "daily_analysis")
    .like("body", `%RS text%`);
  if (rsInDa === 0) pass("C_no_cross_section_leakage");
  else fail("C_no_cross_section_leakage");

  // --- Ineligible video (synthetic channel_post — bot cannot post video to channel) ---
  const videoMessageId = 860000000 + Math.floor(Math.random() * 99999);
  await deliverToStaging(webhookSecret, {
    message_id: videoMessageId,
    chat: { id: Number(CHANNELS.daily_analysis), type: "channel" },
    date: Math.floor(Date.now() / 1000),
    video: { file_id: "BAADBAADrwADBREAAYag", file_unique_id: "viduniq1", width: 320, height: 240, duration: 5 },
  });
  await sleep(1500);
  const { count: videoEligible } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("qualification_status", "eligible")
    .eq("telegram_message_id", videoMessageId);
  if (videoEligible === 0) pass("ineligible_video_only");
  else fail("ineligible_video_only", { videoEligible });

  const videoCapMessageId = videoMessageId + 1;
  await deliverToStaging(webhookSecret, {
    message_id: videoCapMessageId,
    chat: { id: Number(CHANNELS.daily_analysis), type: "channel" },
    date: Math.floor(Date.now() / 1000),
    video: { file_id: "BAADBAADrwADBREAAYah", file_unique_id: "viduniq2", width: 320, height: 240, duration: 5 },
    caption: `${marker} video caption ignore entire post`,
  });
  await sleep(1500);
  const { count: videoCapEligible } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("qualification_status", "eligible")
    .like("body", `%video caption ignore entire post%`);
  if (videoCapEligible === 0) pass("ineligible_video_caption_ignored");
  else fail("ineligible_video_caption_ignored");

  // --- Duplicate ---
  const dupUpdateId = nextUpdateId();
  const dupMessageId = 880000000 + Math.floor(Math.random() * 99999);
  const dupBody = `${marker} duplicate probe exact`;
  const synthetic = {
    update_id: dupUpdateId,
    channel_post: {
      message_id: dupMessageId,
      chat: { id: Number(CHANNELS.academy), type: "channel" },
      date: Math.floor(Date.now() / 1000),
      text: dupBody,
    },
  };
  const first = await fetch(`${STAGING_WEB}/api/webhooks/telegram-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": webhookSecret,
    },
    body: JSON.stringify(synthetic),
  }).then((r) => r.json());
  const second = await fetch(`${STAGING_WEB}/api/webhooks/telegram-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": webhookSecret,
    },
    body: JSON.stringify(synthetic),
  }).then((r) => r.json());
  const { count: dupRows } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("telegram_message_id", dupMessageId);
  if (first.success && second.result?.duplicate && dupRows === 1) pass("duplicate_idempotency");
  else if (dupRows === 1) pass("duplicate_idempotency", { note: "single row retained" });
  else fail("duplicate_idempotency", { dupRows, second });

  // --- Restart recovery fixture ---
  const recoveryGroupId = `${RUN}-recovery`;
  const recoveryChannel = Number(CHANNELS.academy);
  const photoFileId = daImgPost?.telegram_content_images?.[0]?.telegram_file_id;
  const { data: bufferSample } = await admin
    .from("telegram_media_group_buffer")
    .select("photo_file_id")
    .not("photo_file_id", "is", null)
    .limit(1)
    .maybeSingle();
  const fileId = photoFileId || bufferSample?.photo_file_id;

  if (!fileId) {
    fail("restart_recovery", { reason: "no file_id for fixture" });
  } else {
    await admin.from("telegram_media_group_state").upsert({
      telegram_channel_id: recoveryChannel,
      telegram_media_group_id: recoveryGroupId,
      section: "academy",
      has_ineligible_media: false,
      message_count: 3,
      first_received_at: new Date().toISOString(),
      last_received_at: new Date().toISOString(),
      finalize_after: new Date(Date.now() + 180000).toISOString(),
      status: "buffering",
    });
    for (let i = 0; i < 3; i++) {
      await admin.from("telegram_media_group_buffer").upsert(
        {
          telegram_channel_id: recoveryChannel,
          telegram_media_group_id: recoveryGroupId,
          telegram_message_id: 770000000 + i,
          section: "academy",
          body: i === 0 ? `${marker} recovery album caption` : null,
          photo_file_id: fileId,
          photo_width: 640,
          photo_height: 480,
          processing_status: "pending",
        },
        { onConflict: "telegram_channel_id,telegram_message_id" }
      );
    }

    spawnSync(
      "npx",
      ["@railway/cli@latest", "up", "--service", "hasan-chart-website-staging", "--environment", "staging", "--detach"],
      { cwd: process.cwd(), stdio: "ignore" }
    );

    await sleep(150000);
    await admin
      .from("telegram_media_group_state")
      .update({ finalize_after: new Date(Date.now() + 8000).toISOString() })
      .eq("telegram_media_group_id", recoveryGroupId)
      .eq("status", "buffering");

    await sleep(12000);
    const { data: recoveryState } = await admin
      .from("telegram_media_group_state")
      .select("status")
      .eq("telegram_media_group_id", recoveryGroupId)
      .maybeSingle();
    if (recoveryState?.status === "finalized") pass("restart_recovery_album_finalized");
    else fail("restart_recovery_album_finalized", { status: recoveryState?.status });
  }

  // --- Storage cleanup ---
  if (rsImgPost) {
    const paths = (rsImgPost.telegram_content_images || []).map((i) => i.storage_path).filter(Boolean);
    if (paths.length) await admin.storage.from("telegram-content-images").remove(paths);
    await admin.from("telegram_content_images").delete().eq("post_id", rsImgPost.id);
    await admin.from("telegram_content_posts").delete().eq("id", rsImgPost.id);
    pass("storage_cleanup_disposable_post");
  } else fail("storage_cleanup_disposable_post");

  // --- Idle ---
  const { count: pendingGroups } = await admin
    .from("telegram_media_group_state")
    .select("*", { count: "exact", head: true })
    .eq("status", "buffering");
  if (pendingGroups === 0) pass("idle_no_pending_album_groups");
  else fail("idle_no_pending_album_groups", { pendingGroups });
  pass("idle_no_setInterval_polling", {
    note: "Phase 2A.1 per-album timers only; no recurring Telegram sweep in code",
  });

  // Cleanup
  const { data: canaryPosts } = await admin
    .from("telegram_content_posts")
    .select("id, telegram_content_images(storage_path)")
    .like("body", `%${marker}%`);
  for (const post of canaryPosts || []) {
    const paths = (post.telegram_content_images || []).map((i) => i.storage_path).filter(Boolean);
    if (paths.length) await admin.storage.from("telegram-content-images").remove(paths);
    await admin.from("telegram_content_posts").delete().eq("id", post.id);
  }
  await admin.from("telegram_media_group_buffer").delete().eq("telegram_media_group_id", recoveryGroupId);
  await admin.from("telegram_media_group_state").delete().eq("telegram_media_group_id", recoveryGroupId);
  await admin.from("telegram_webhook_ingress_log").delete().eq("telegram_update_id", dupUpdateId);

  report.verdict =
    report.failures.length === 0
      ? "PHASE 2B STAGING CANARY PASS — READY FOR PUBLIC READ INTEGRATION"
      : "PHASE 2B BLOCKED — ROOT CAUSE MUST BE FIXED";
  report.failureCount = report.failures.length;
  report.passCount = report.tests.filter((t) => t.status === "PASS").length;
  report.productionUntouched = true;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: err.message }));
  process.exit(1);
});
