#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMockSupabase, installRetentionRpc, makePngBuffer } from "./test-telegram-content/mock-supabase.js";
import { bufferTelegramAlbumMessage } from "../lib/telegram-content/album-buffer-handler.js";
import { finalizeOneAlbumGroup } from "../lib/telegram-content/album-finalizer.js";
import {
  clearAlbumTimerRegistryForTests,
  fireAlbumGroupTimer,
  getAlbumTimerRegistrySize,
  getScheduledAlbumTimerKeys,
  hasRecurringAlbumSweepForTests,
  recoverTelegramAlbumTimersOnStartup,
  scheduleAlbumGroupFinalization,
} from "../lib/telegram-content/album-liveness-scheduler.js";

const CHANNEL = -1001234567890;
const ENV = {
  TELEGRAM_CONTENT_BOT_TOKEN: "123:test-token",
  TELEGRAM_CONTENT_CHANNEL_DAILY_ANALYSIS: String(CHANNEL),
};

function photoMessage(id, caption = "", groupId = "album-live") {
  return {
    message_id: id,
    date: Math.floor(Date.now() / 1000),
    chat: { id: CHANNEL, type: "channel" },
    caption,
    media_group_id: groupId,
    photo: [
      {
        file_id: `file-${id}`,
        file_unique_id: `unique-${id}`,
        width: 10,
        height: 10,
      },
    ],
  };
}

function makeFetchStub() {
  const png = makePngBuffer();
  return async (url) => {
    if (String(url).includes("/getFile")) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { file_path: "photos/test.png", file_size: png.length } }),
      };
    }
    return {
      ok: true,
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    };
  };
}

beforeEach(() => {
  clearAlbumTimerRegistryForTests();
});

afterEach(() => {
  clearAlbumTimerRegistryForTests();
});

describe("telegram content phase 2A.1 liveness/cost", () => {
  it("1 last album webhook finalizes via per-group timer (no later webhook)", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const groupId = "album-timer-only";
    const fetchImpl = makeFetchStub();

    await bufferTelegramAlbumMessage(supabase, {
      section: "daily_analysis",
      channelId: CHANNEL,
      mediaGroupId: groupId,
      messageId: 901,
      message: photoMessage(901, "timer album", groupId),
      updateId: 2001,
    });

    assert.equal(getAlbumTimerRegistrySize(), 1);

    await supabase
      .from("telegram_media_group_state")
      .update({ finalize_after: new Date(Date.now() - 1000).toISOString() })
      .eq("telegram_channel_id", CHANNEL)
      .eq("telegram_media_group_id", groupId);

    const outcome = await fireAlbumGroupTimer(CHANNEL, groupId, { supabase, env: ENV, fetchImpl });
    assert.equal(outcome.ok, true);
    assert.equal(supabase.state.posts.length, 1);
    assert.equal(getAlbumTimerRegistrySize(), 0);
  });

  it("2 startup recovery restores timer before finalize_after", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const groupId = "album-restart-timer";
    const future = new Date(Date.now() + 5000).toISOString();

    supabase.state.groupState.push({
      telegram_channel_id: CHANNEL,
      telegram_media_group_id: groupId,
      section: "daily_analysis",
      has_ineligible_media: false,
      message_count: 1,
      first_received_at: new Date().toISOString(),
      last_received_at: new Date().toISOString(),
      finalize_after: future,
      status: "buffering",
    });

    supabase.state.buffer.push({
      telegram_channel_id: CHANNEL,
      telegram_media_group_id: groupId,
      telegram_message_id: 1001,
      section: "daily_analysis",
      processing_status: "pending",
      photo_file_id: "file-1001",
      body: "cap",
    });

    const recovery = await recoverTelegramAlbumTimersOnStartup({ supabase, env: ENV });
    assert.equal(recovery.timersRestored, 1);
    assert.equal(getAlbumTimerRegistrySize(), 1);
    assert.equal(recovery.immediateFinalized, 0);
  });

  it("3 startup recovery finalizes immediately when finalize_after elapsed", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const groupId = "album-restart-due";
    const fetchImpl = makeFetchStub();

    supabase.state.groupState.push({
      telegram_channel_id: CHANNEL,
      telegram_media_group_id: groupId,
      section: "daily_analysis",
      has_ineligible_media: false,
      message_count: 1,
      first_received_at: new Date().toISOString(),
      last_received_at: new Date().toISOString(),
      finalize_after: new Date(Date.now() - 1000).toISOString(),
      status: "buffering",
    });

    supabase.state.buffer.push({
      telegram_channel_id: CHANNEL,
      telegram_media_group_id: groupId,
      telegram_message_id: 1002,
      section: "daily_analysis",
      processing_status: "pending",
      photo_file_id: "file-1002",
      body: "cap",
    });

    const recovery = await recoverTelegramAlbumTimersOnStartup({ supabase, env: ENV, fetchImpl });
    assert.equal(recovery.immediateFinalized, 1);
    assert.equal(supabase.state.posts.length, 1);
    assert.equal(getAlbumTimerRegistrySize(), 0);
  });

  it("4 no pending albums => no recurring sweep and zero timers", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);

    const recovery = await recoverTelegramAlbumTimersOnStartup({ supabase, env: ENV });
    assert.equal(recovery.recovered, 0);
    assert.equal(getAlbumTimerRegistrySize(), 0);
    assert.equal(hasRecurringAlbumSweepForTests(), false);
  });

  it("5 new album member reschedules existing timer to later finalize_after", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const groupId = "album-reschedule";
    const firstFinalize = new Date(Date.now() + 5000).toISOString();

    scheduleAlbumGroupFinalization(CHANNEL, groupId, firstFinalize, { supabase, env: ENV });
    const firstKey = getScheduledAlbumTimerKeys()[0];
    assert.ok(firstKey);

    const secondFinalize = new Date(Date.now() + 9000).toISOString();
    scheduleAlbumGroupFinalization(CHANNEL, groupId, secondFinalize, { supabase, env: ENV });

    assert.equal(getAlbumTimerRegistrySize(), 1);
    assert.equal(getScheduledAlbumTimerKeys()[0], firstKey);

    supabase.state.groupState.push({
      telegram_channel_id: CHANNEL,
      telegram_media_group_id: groupId,
      section: "daily_analysis",
      status: "buffering",
      finalize_after: secondFinalize,
    });

    await supabase
      .from("telegram_media_group_state")
      .update({ finalize_after: firstFinalize })
      .eq("telegram_channel_id", CHANNEL)
      .eq("telegram_media_group_id", groupId);

    const early = await fireAlbumGroupTimer(CHANNEL, groupId, { supabase, env: ENV, fetchImpl: makeFetchStub() });
    assert.equal(early.rescheduled, true);
    assert.equal(getAlbumTimerRegistrySize(), 1);
  });

  it("6 duplicate schedule replaces timer — only one registry entry", async () => {
    const supabase = createMockSupabase();
    const groupId = "album-dup-timer";
    const when = new Date(Date.now() + 4000).toISOString();

    scheduleAlbumGroupFinalization(CHANNEL, groupId, when, { supabase, env: ENV });
    scheduleAlbumGroupFinalization(CHANNEL, groupId, when, { supabase, env: ENV });

    assert.equal(getAlbumTimerRegistrySize(), 1);
  });

  it("7 two replica timers => one published post (DB claim wins)", async () => {
    const supabase = createMockSupabase();
    installRetentionRpc(supabase.state);
    const groupId = "album-race";
    const fetchImpl = makeFetchStub();

    const groupState = {
      telegram_channel_id: CHANNEL,
      telegram_media_group_id: groupId,
      section: "daily_analysis",
      has_ineligible_media: false,
      message_count: 1,
      first_received_at: new Date().toISOString(),
      last_received_at: new Date().toISOString(),
      finalize_after: new Date(Date.now() - 1000).toISOString(),
      status: "buffering",
    };

    supabase.state.groupState.push(groupState);
    supabase.state.buffer.push({
      telegram_channel_id: CHANNEL,
      telegram_media_group_id: groupId,
      telegram_message_id: 2001,
      section: "daily_analysis",
      processing_status: "pending",
      photo_file_id: "file-2001",
      body: "race",
    });

    const [a, b] = await Promise.all([
      finalizeOneAlbumGroup(supabase, groupState, { env: ENV, fetchImpl }),
      finalizeOneAlbumGroup(supabase, groupState, { env: ENV, fetchImpl }),
    ]);

    const successes = [a, b].filter((item) => item.ok && item.postId);
    const skipped = [a, b].filter((item) => item.skipped || item.duplicate);
    assert.equal(supabase.state.posts.length, 1);
    assert.equal(successes.length + skipped.length, 2);
  });

  it("8 startup recovery wired in instrumentation.js (not webhook route)", () => {
    const instrumentation = readFileSync(join(process.cwd(), "instrumentation.js"), "utf8");
    const webhookRoute = readFileSync(
      join(process.cwd(), "app/api/webhooks/telegram-content/route.js"),
      "utf8"
    );

    assert.match(instrumentation, /recoverTelegramAlbumTimersOnStartup/);
    assert.doesNotMatch(webhookRoute, /recoverTelegramAlbumTimersOnStartup/);
    assert.doesNotMatch(webhookRoute, /ensureTelegramAlbumLivenessScheduler/);
    assert.doesNotMatch(webhookRoute, /setInterval/);
  });
});

console.log("telegram content phase 2A.1 tests loaded");
