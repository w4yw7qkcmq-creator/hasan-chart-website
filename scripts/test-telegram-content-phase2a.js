#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createMockSupabase, installRetentionRpc, makePngBuffer, makeCorruptBuffer, makeOversizeBuffer } from "./test-telegram-content/mock-supabase.js";
import { timingSafeSecretEqual, verifyTelegramContentWebhookSecret } from "../lib/telegram-content/webhook-verify.js";
import { parseTelegramContentUpdate, selectLargestTelegramPhoto } from "../lib/telegram-content/update-parser.js";
import { qualifiesForTelegramContentPublish, detectIneligibleTelegramMedia } from "../lib/telegram-content/qualification.js";
import { validateTelegramImageBuffer } from "../lib/telegram-content/image-validation.js";
import { buildTelegramContentPublicSlug, resetChannelToSectionMapCache } from "../lib/telegram-content/channel-map.js";
import { bufferTelegramAlbumMessage } from "../lib/telegram-content/album-buffer-handler.js";
import { finalizeOneAlbumGroup } from "../lib/telegram-content/album-finalizer.js";
import { createTelegramSingleMessagePost } from "../lib/telegram-content/single-message-handler.js";
import { handleEditedTelegramChannelPost } from "../lib/telegram-content/edit-handler.js";
import { processTelegramContentUpdate } from "../lib/telegram-content/process-update.js";
import { enforceTelegramSectionRetention } from "../lib/telegram-content/retention.js";
import {
  clearAlbumTimerRegistryForTests,
  fireAlbumGroupTimer,
  recoverTelegramAlbumTimersOnStartup,
} from "../lib/telegram-content/album-liveness-scheduler.js";

const CHANNEL = -1001234567890;
const ENV = {
  TELEGRAM_CONTENT_WEBHOOK_SECRET: "test-webhook-secret",
  TELEGRAM_CONTENT_BOT_TOKEN: "123:test-token",
  TELEGRAM_CONTENT_CHANNEL_DAILY_ANALYSIS: String(CHANNEL),
  TELEGRAM_CONTENT_CHANNEL_ACADEMY: "-100999",
  TELEGRAM_CONTENT_CHANNEL_RESULT: "-100888",
};

function makeRequest(headers = {}) {
  return { headers: { get: (key) => headers[key.toLowerCase()] || headers[key] || null } };
}

function makeFetchStub(buffer) {
  return async (url) => {
    if (String(url).includes("/getFile")) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { file_path: "photos/test.jpg", file_size: buffer.length } }),
      };
    }
    return { ok: true, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  };
}

function textMessage(id, text, extra = {}) {
  return {
    message_id: id,
    date: Math.floor(Date.now() / 1000),
    chat: { id: CHANNEL, type: "channel" },
    text,
    ...extra,
  };
}

function photoMessage(id, caption, sizes = [100, 500]) {
  return {
    message_id: id,
    date: Math.floor(Date.now() / 1000),
    chat: { id: CHANNEL, type: "channel" },
    caption,
    photo: sizes.map((size, index) => ({
      file_id: `file-${id}-${index}`,
      file_unique_id: `unique-${id}-${index}`,
      width: size,
      height: size,
      file_size: size,
    })),
  };
}

before(() => {
  resetChannelToSectionMapCache();
});

after(() => {
  clearAlbumTimerRegistryForTests();
  resetChannelToSectionMapCache();
});

describe("telegram content phase 2A", () => {
  it("1-3 webhook secret + unknown update/channel", async () => {
    const missing = verifyTelegramContentWebhookSecret(makeRequest({}), { TELEGRAM_CONTENT_WEBHOOK_SECRET: "" });
    assert.equal(missing.ok, false);

    const invalid = verifyTelegramContentWebhookSecret(
      makeRequest({ "x-telegram-bot-api-secret-token": "bad" }),
      ENV
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 401);

    const valid = verifyTelegramContentWebhookSecret(
      makeRequest({ "x-telegram-bot-api-secret-token": ENV.TELEGRAM_CONTENT_WEBHOOK_SECRET }),
      ENV
    );
    assert.equal(valid.ok, true);
    assert.equal(timingSafeSecretEqual("abc", "abc"), true);

    const unknownUpdate = parseTelegramContentUpdate({ update_id: 1, message: { chat: { id: 1 }, message_id: 1 } });
    assert.equal(unknownUpdate.isAcceptedType, false);

    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const unknownChannel = await processTelegramContentUpdate(
      supabase,
      {
        updateId: 10,
        updateType: "channel_post",
        message: textMessage(1, "hello"),
        channelId: -999999,
        messageId: 1,
        mediaGroupId: null,
        isAcceptedType: true,
        isEdit: false,
      },
      { env: ENV, fetchImpl: makeFetchStub(makePngBuffer()) }
    );
    assert.equal(unknownChannel.ignored, true);
  });

  it("4-8 text/single image/highest-res/corrupt/oversize", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);

    const textOnly = qualifiesForTelegramContentPublish(textMessage(1, "plain text"));
    assert.equal(textOnly.ok, true);
    assert.equal(textOnly.hasPhoto, false);

    const png = makePngBuffer();
    const created = await createTelegramSingleMessagePost({
      supabase,
      section: "daily_analysis",
      channelId: CHANNEL,
      messageId: 42,
      message: photoMessage(42, "caption"),
      env: ENV,
      fetchImpl: makeFetchStub(png),
    });
    assert.equal(created.ok, true);
    assert.equal(supabase.state.posts.length, 1);
    assert.equal(supabase.state.images.length, 1);

    const sizes = [100, 400, 900];
    const largest = selectLargestTelegramPhoto(photoMessage(2, "cap", sizes));
    assert.equal(largest.width, 900);

    assert.equal(validateTelegramImageBuffer(makeCorruptBuffer()).ok, false);
    assert.equal(validateTelegramImageBuffer(makeOversizeBuffer()).ok, false);

    const video = detectIneligibleTelegramMedia({ video: { file_id: "v1" } });
    assert.equal(video.eligible, false);
  });

  it("9-10 video + animation rejection", () => {
    assert.equal(detectIneligibleTelegramMedia({ animation: { file_id: "a1" } }).eligible, false);
    assert.equal(detectIneligibleTelegramMedia({ video_note: { file_id: "vn1" } }).eligible, false);
  });

  it("11-16 album flows", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const png = makePngBuffer();
    const fetchImpl = makeFetchStub(png);
    const groupId = "album-1";

    for (const messageId of [30, 10, 20]) {
      await bufferTelegramAlbumMessage(supabase, {
        section: "academy",
        channelId: CHANNEL,
        mediaGroupId: groupId,
        messageId,
        message: { ...photoMessage(messageId, messageId === 10 ? "album caption" : ""), media_group_id: groupId },
        updateId: messageId,
      });
    }

    await supabase
      .from("telegram_media_group_state")
      .update({ finalize_after: new Date(Date.now() - 1000).toISOString() })
      .eq("telegram_channel_id", CHANNEL)
      .eq("telegram_media_group_id", groupId);

    const finalized = await fireAlbumGroupTimer(CHANNEL, groupId, {
      supabase,
      env: ENV,
      fetchImpl,
      now: new Date(),
    });
    assert.equal(finalized.ok, true);
    assert.equal(supabase.state.posts.length, 1);
    assert.equal(supabase.state.images.length, 3);
    assert.equal(supabase.state.posts[0].telegram_message_id, 10);
    assert.equal(supabase.state.images[0].source_message_id, 10);

    const dup = await bufferTelegramAlbumMessage(supabase, {
      section: "academy",
      channelId: CHANNEL,
      mediaGroupId: "album-dup",
      messageId: 501,
      message: { ...photoMessage(501, ""), media_group_id: "album-dup" },
      updateId: 777,
    });
    assert.equal(dup.buffered, true);
    const dup2 = await bufferTelegramAlbumMessage(supabase, {
      section: "academy",
      channelId: CHANNEL,
      mediaGroupId: "album-dup",
      messageId: 501,
      message: { ...photoMessage(501, ""), media_group_id: "album-dup" },
      updateId: 778,
    });
    assert.equal(dup2.duplicate, true);

    const mixed = await bufferTelegramAlbumMessage(supabase, {
      section: "result",
      channelId: CHANNEL,
      mediaGroupId: "album-mixed",
      messageId: 601,
      message: { ...photoMessage(601, ""), media_group_id: "album-mixed" },
      updateId: 901,
    });
    assert.equal(mixed.buffered, true);
    const mixedVideo = await bufferTelegramAlbumMessage(supabase, {
      section: "result",
      channelId: CHANNEL,
      mediaGroupId: "album-mixed",
      messageId: 602,
      message: {
        message_id: 602,
        chat: { id: CHANNEL },
        media_group_id: "album-mixed",
        video: { file_id: "v" },
      },
      updateId: 902,
    });
    assert.equal(mixedVideo.rejected, true);
    assert.equal(supabase.state.groupState.find((g) => g.telegram_media_group_id === "album-mixed").status, "rejected");
    assert.equal(supabase.state.posts.filter((p) => p.telegram_media_group_id === "album-mixed").length, 0);
  });

  it("17 album liveness without later webhook", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const fetchImpl = makeFetchStub(makePngBuffer());
    const groupId = "album-live";
    await bufferTelegramAlbumMessage(supabase, {
      section: "daily_analysis",
      channelId: CHANNEL,
      mediaGroupId: groupId,
      messageId: 701,
      message: { ...photoMessage(701, "live album"), media_group_id: groupId },
      updateId: 1001,
    });
    await supabase
      .from("telegram_media_group_state")
      .update({ finalize_after: new Date(Date.now() - 1000).toISOString() })
      .eq("telegram_channel_id", CHANNEL)
      .eq("telegram_media_group_id", groupId);

    const outcome = await fireAlbumGroupTimer(CHANNEL, groupId, { supabase, env: ENV, fetchImpl });
    assert.equal(outcome.ok, true);
    assert.equal(supabase.state.groupState[0].status, "finalized");
  });

  it("18-19 restart + race behavior", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const groupId = "race-group";
    const fetchImpl = makeFetchStub(makePngBuffer());

    await bufferTelegramAlbumMessage(supabase, {
      section: "result",
      channelId: CHANNEL,
      mediaGroupId: groupId,
      messageId: 801,
      message: { ...photoMessage(801, "race"), media_group_id: groupId },
      updateId: 1101,
    });

    const recovery = await recoverTelegramAlbumTimersOnStartup({ supabase, env: ENV, fetchImpl });
    assert.ok(recovery.recovered >= 1);

    await supabase
      .from("telegram_media_group_state")
      .update({ finalize_after: new Date(Date.now() - 1000).toISOString() })
      .eq("telegram_channel_id", CHANNEL)
      .eq("telegram_media_group_id", groupId);

    const [a, b] = await Promise.all([
      fireAlbumGroupTimer(CHANNEL, groupId, { supabase, env: ENV, fetchImpl }),
      fireAlbumGroupTimer(CHANNEL, groupId, { supabase, env: ENV, fetchImpl }),
    ]);

    const createdPosts = supabase.state.posts.filter((p) => p.telegram_media_group_id === groupId);
    assert.equal(createdPosts.length, 1);
    assert.ok((a.ok && a.postId) || (b.ok && b.postId) || a.skipped || b.skipped);
  });

  it("20-23 edit foundation", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const slug = buildTelegramContentPublicSlug("academy", 900);
    const postId = "11111111-1111-4111-8111-111111111111";
    supabase.state.posts.push({
      id: postId,
      section: "academy",
      telegram_channel_id: CHANNEL,
      telegram_message_id: 900,
      telegram_media_group_id: null,
      body: "old text",
      public_slug: slug,
      sync_status: "published",
      qualification_status: "eligible",
    });

    const edited = await handleEditedTelegramChannelPost({
      supabase,
      channelId: CHANNEL,
      messageId: 900,
      mediaGroupId: null,
      message: { ...textMessage(900, "new text"), edit_date: 999999 },
      env: ENV,
    });
    assert.equal(edited.ok, true);
    assert.equal(supabase.state.posts[0].body, "new text");
    assert.equal(supabase.state.posts[0].public_slug, slug);

    const dupEdit = await handleEditedTelegramChannelPost({
      supabase,
      channelId: CHANNEL,
      messageId: 900,
      mediaGroupId: null,
      message: { ...textMessage(900, "new text"), edit_date: 999999 },
      env: ENV,
    });
    assert.equal(dupEdit.ok, true);

    const ineligibleEdit = await handleEditedTelegramChannelPost({
      supabase,
      channelId: CHANNEL,
      messageId: 900,
      mediaGroupId: null,
      message: { message_id: 900, chat: { id: CHANNEL }, video: { file_id: "v" }, edit_date: 999999 },
      env: ENV,
    });
    assert.equal(ineligibleEdit.reviewFlagged, true);
  });

  it("24-29 retention + compensation", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);

    for (let i = 1; i <= 101; i += 1) {
      supabase.state.posts.push({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        section: "daily_analysis",
        telegram_channel_id: CHANNEL,
        telegram_message_id: i,
        body: `post-${i}`,
        public_slug: `tg-da-${i}`,
        sync_status: "published",
        qualification_status: "eligible",
        published_at: new Date(i * 1000).toISOString(),
      });
      supabase.state.images.push({
        id: randomId(),
        post_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        storage_path: `daily_analysis/post-${i}/0.jpg`,
        sort_order: 0,
      });
      supabase.state.storage.set(`telegram-content-images:daily_analysis/post-${i}/0.jpg`, makePngBuffer());
    }

    supabase.state.posts.push({
      id: "legacy-manual-should-not-touch",
      section: "academy",
      body: "manual",
      public_slug: "manual-1",
      sync_status: "published",
      qualification_status: "eligible",
      published_at: new Date().toISOString(),
    });

    const retention = await enforceTelegramSectionRetention(supabase, "daily_analysis", { limit: 100 });
    assert.equal(retention.deletedCount, 1);
    assert.equal(supabase.state.posts.filter((p) => p.section === "daily_analysis").length, 100);
    assert.ok(supabase.state.posts.some((p) => p.id === "legacy-manual-should-not-touch"));

    const isolated = await enforceTelegramSectionRetention(supabase, "academy", { limit: 100 });
    assert.equal(isolated.deletedCount, 0);

    const failingSupabase = createMockSupabase();
    installRetentionRpc(failingSupabase.state);
    failingSupabase.state.posts.push({
      id: "delete-me",
      section: "result",
      body: "x",
      public_slug: "tg-rs-1",
      sync_status: "published",
      qualification_status: "eligible",
      published_at: new Date().toISOString(),
    });
    failingSupabase.state.posts.push({
      id: "keep-me",
      section: "result",
      body: "y",
      public_slug: "tg-rs-2",
      sync_status: "published",
      qualification_status: "eligible",
      published_at: new Date(Date.now() + 10000).toISOString(),
    });
    failingSupabase.state.rpcHandlers.enforce_telegram_section_retention = () => [
      { deleted_post_id: "delete-me", storage_paths: ["result/delete-me/0.jpg"] },
    ];
    failingSupabase.storage.from = () => ({
      remove: async () => ({ data: null, error: { message: "fail" } }),
    });
    const failed = await enforceTelegramSectionRetention(failingSupabase, "result", { limit: 1 });
    assert.equal(failed.results[0].deleted, false);
    assert.equal(failingSupabase.state.posts.some((p) => p.id === "delete-me"), true);
  });

  it("30 ingress cleanup rpc exists", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const { data, error } = await supabase.rpc("cleanup_telegram_content_operational_tables", {
      p_ingress_retention_days: 30,
      p_buffer_terminal_retention_days: 7,
    });
    assert.equal(error, null);
    assert.ok(data);
  });

  it("duplicate telegram update + process flow", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const parsed = {
      updateId: 5001,
      updateType: "channel_post",
      message: textMessage(501, "dup flow"),
      channelId: CHANNEL,
      messageId: 501,
      mediaGroupId: null,
      isAcceptedType: true,
      isEdit: false,
    };

    const first = await processTelegramContentUpdate(supabase, parsed, { env: ENV });
    assert.equal(first.duplicate, undefined);
    assert.equal(first.single, true);

    const second = await processTelegramContentUpdate(supabase, parsed, { env: ENV });
    assert.equal(second.duplicate, true);
  });
});

function randomId() {
  return `${Date.now()}-${Math.random()}`;
}

console.log("telegram content phase 2A tests loaded");
