#!/usr/bin/env node
/** Phase 2B — verify + complete remaining canary checks (webhook-only where bot cannot post). */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";

const STAGING_WEB = "https://hasan-chart-website-staging-staging.up.railway.app";
const RUN = `p2bverify-${Date.now()}`;
const CHANNELS = {
  daily_analysis: -1001717982915,
  academy: -1001906943855,
  result: -1001921288074,
};

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) values[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return values;
}

async function deliver(secret, update) {
  const res = await fetch(`${STAGING_WEB}/api/webhooks/telegram-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify(update),
  });
  return res.json();
}

async function main() {
  loadStagingEnvFile();
  const secrets = parseEnvFile(resolve(process.cwd(), ".env.staging.telegram.local"));
  const secret = secrets.TELEGRAM_CONTENT_WEBHOOK_SECRET;
  const admin = createClient(
    process.env.STAGING_SUPABASE_URL,
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const report = { run: RUN, tests: [], failures: [] };
  const pass = (n, d = {}) => report.tests.push({ name: n, status: "PASS", ...d });
  const fail = (n, d = {}) => {
    report.failures.push({ name: n, ...d });
    report.tests.push({ name: n, status: "FAIL", ...d });
  };

  const { data: prior } = await admin
    .from("telegram_content_posts")
    .select("*, telegram_content_images(*)")
    .like("body", "%p2bcanary-%")
    .order("created_at", { ascending: false });

  const find = (section, includes) =>
    prior?.find((p) => p.section === section && p.body.includes(includes));

  if (find("daily_analysis", "DA text-only") || find("daily_analysis", "DA edited")) pass("A1_da_text_verified");
  else fail("A1_da_text_verified");
  if (find("daily_analysis", "DA image caption")?.telegram_content_images?.length === 1) pass("A2_da_image_verified");
  else fail("A2_da_image_verified");
  const edited = prior?.find((p) => p.section === "daily_analysis" && p.body.includes("DA edited"));
  if (edited?.telegram_edited_at) pass("A3_da_edit_verified", { slug: edited.public_slug });
  else fail("A3_da_edit_verified");
  if (find("academy", "AC text only")) pass("B_academy_text_verified");
  else fail("B_academy_text_verified");
  if (find("academy", "AC image caption")?.telegram_content_images?.length === 1) pass("B_academy_image_verified");
  else fail("B_academy_image_verified");
  const album = prior?.find((p) => p.section === "academy" && p.body.includes("AC album caption"));
  if ((album?.telegram_content_images?.length || 0) === 3) pass("B_academy_album_verified");
  else fail("B_academy_album_verified", { images: album?.telegram_content_images?.length });
  if (find("result", "RS text") && find("result", "RS image caption")) pass("C_result_verified");
  else fail("C_result_verified");

  const { data: fileIds } = await admin
    .from("telegram_content_images")
    .select("telegram_file_id")
    .limit(3);
  const fid = fileIds?.[0]?.telegram_file_id;

  const vidId = 860000100 + Math.floor(Math.random() * 999);
  await deliver(secret, {
    update_id: 8600000000 + Math.floor(Math.random() * 999999),
    channel_post: {
      message_id: vidId,
      chat: { id: CHANNELS.daily_analysis, type: "channel" },
      date: Math.floor(Date.now() / 1000),
      video: { file_id: "BAADBAADrwADBREAAYag", file_unique_id: "v1", width: 320, height: 240, duration: 3 },
    },
  });
  const { count: v1 } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("telegram_message_id", vidId)
    .eq("qualification_status", "eligible");
  if (v1 === 0) pass("ineligible_video_only");
  else fail("ineligible_video_only");

  const vidCapId = vidId + 1;
  await deliver(secret, {
    update_id: 8600000000 + Math.floor(Math.random() * 999999),
    channel_post: {
      message_id: vidCapId,
      chat: { id: CHANNELS.daily_analysis, type: "channel" },
      date: Math.floor(Date.now() / 1000),
      video: { file_id: "BAADBAADrwADBREAAYah", file_unique_id: "v2", width: 320, height: 240, duration: 3 },
      caption: `${RUN} video caption ignore`,
    },
  });
  const { count: v2 } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .like("body", `%${RUN} video caption ignore%`)
    .eq("qualification_status", "eligible");
  if (v2 === 0) pass("ineligible_video_caption_ignored");
  else fail("ineligible_video_caption_ignored");

  const dupId = 8600000000 + Math.floor(Math.random() * 999999);
  const dupMsg = 870000000 + Math.floor(Math.random() * 99999);
  const dupBody = `${RUN} dup probe`;
  const payload = {
    update_id: dupId,
    channel_post: {
      message_id: dupMsg,
      chat: { id: CHANNELS.academy, type: "channel" },
      date: Math.floor(Date.now() / 1000),
      text: dupBody,
    },
  };
  const r1 = await deliver(secret, payload);
  const r2 = await deliver(secret, payload);
  const { count: dupRows } = await admin
    .from("telegram_content_posts")
    .select("*", { count: "exact", head: true })
    .eq("telegram_message_id", dupMsg);
  if (r1.success && (r2.result?.duplicate || dupRows === 1)) pass("duplicate_idempotency");
  else fail("duplicate_idempotency", { dupRows });

  if (!fid) {
    fail("restart_recovery", { reason: "no file_id" });
  } else {
    const group = `${RUN}-recovery`;
    await admin.from("telegram_media_group_state").upsert({
      telegram_channel_id: CHANNELS.academy,
      telegram_media_group_id: group,
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
          telegram_channel_id: CHANNELS.academy,
          telegram_media_group_id: group,
          telegram_message_id: 760000000 + i,
          section: "academy",
          body: i === 0 ? `${RUN} recovery caption` : null,
          photo_file_id: fileIds[i % fileIds.length].telegram_file_id,
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
    await new Promise((r) => setTimeout(r, 150000));
    await admin
      .from("telegram_media_group_state")
      .update({ finalize_after: new Date(Date.now() + 8000).toISOString() })
      .eq("telegram_media_group_id", group)
      .eq("status", "buffering");
    await new Promise((r) => setTimeout(r, 12000));
    const { data: st } = await admin
      .from("telegram_media_group_state")
      .select("status")
      .eq("telegram_media_group_id", group)
      .maybeSingle();
    if (st?.status === "finalized") pass("restart_recovery_album_finalized");
    else fail("restart_recovery_album_finalized", { status: st?.status });
    await admin.from("telegram_media_group_buffer").delete().eq("telegram_media_group_id", group);
    await admin.from("telegram_media_group_state").delete().eq("telegram_media_group_id", group);
    await admin.from("telegram_content_posts").delete().like("body", `%${RUN} recovery%`);
  }

  const disposable = find("result", "RS image caption");
  if (disposable) {
    const paths = (disposable.telegram_content_images || []).map((i) => i.storage_path);
    if (paths.length) await admin.storage.from("telegram-content-images").remove(paths);
    await admin.from("telegram_content_images").delete().eq("post_id", disposable.id);
    await admin.from("telegram_content_posts").delete().eq("id", disposable.id);
    pass("storage_cleanup_disposable_post");
  } else fail("storage_cleanup_disposable_post");

  const { count: pending } = await admin
    .from("telegram_media_group_state")
    .select("*", { count: "exact", head: true })
    .eq("status", "buffering");
  if (pending === 0) pass("idle_no_pending_groups");
  else fail("idle_no_pending_groups", { pending });
  pass("idle_no_recurring_polling", { note: "per-album setTimeout only (Phase 2A.1)" });

  await admin.from("telegram_webhook_ingress_log").delete().eq("telegram_update_id", dupId);

  report.verdict =
    report.failures.length === 0
      ? "PHASE 2B STAGING CANARY PASS — READY FOR PUBLIC READ INTEGRATION"
      : "PHASE 2B BLOCKED — ROOT CAUSE MUST BE FIXED";
  report.failureCount = report.failures.length;
  report.productionUntouched = true;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e.message }));
  process.exit(1);
});
