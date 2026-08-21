import { finalizeOneAlbumGroup } from "./album-finalizer.js";
import {
  TELEGRAM_CONTENT_INGRESS_LOG_RETENTION_DAYS,
  TELEGRAM_CONTENT_BUFFER_TERMINAL_RETENTION_DAYS,
  TELEGRAM_CONTENT_OPERATIONAL_CLEANUP_THROTTLE_MS,
} from "./constants.js";
import { runOperationalCleanup } from "./operational-cleanup.js";
import { logApiWarning } from "../structured-logger.js";

/** @type {Map<string, { timer: NodeJS.Timeout, finalizeAfterMs: number }>} */
const timerRegistry = new Map();

let startupRecoveryPromise = null;
let lastOperationalCleanupAt = 0;
let finalizeInFlightKeys = new Set();

function buildRegistryKey(channelId, mediaGroupId) {
  return `${String(channelId)}:${String(mediaGroupId)}`;
}

function parseFinalizeAfterMs(finalizeAfter) {
  const ms = new Date(finalizeAfter).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

export function getAlbumTimerRegistrySize() {
  return timerRegistry.size;
}

export function getScheduledAlbumTimerKeys() {
  return [...timerRegistry.keys()];
}

export function clearAlbumTimerRegistryForTests() {
  for (const entry of timerRegistry.values()) {
    clearTimeout(entry.timer);
  }
  timerRegistry.clear();
  startupRecoveryPromise = null;
  lastOperationalCleanupAt = 0;
  finalizeInFlightKeys = new Set();
}

export function cancelAlbumGroupTimer(channelId, mediaGroupId) {
  const key = buildRegistryKey(channelId, mediaGroupId);
  const existing = timerRegistry.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    timerRegistry.delete(key);
  }
}

export function scheduleAlbumGroupFinalization(
  channelId,
  mediaGroupId,
  finalizeAfter,
  { env = process.env, fetchImpl = fetch, supabase = null } = {}
) {
  const key = buildRegistryKey(channelId, mediaGroupId);
  const finalizeAfterMs = parseFinalizeAfterMs(finalizeAfter);
  const delayMs = Math.max(0, finalizeAfterMs - Date.now());

  cancelAlbumGroupTimer(channelId, mediaGroupId);

  const timer = setTimeout(() => {
    fireAlbumGroupTimer(channelId, mediaGroupId, { env, fetchImpl, supabase }).catch(() => {
      // Errors are logged inside fireAlbumGroupTimer.
    });
  }, delayMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  timerRegistry.set(key, { timer, finalizeAfterMs });
  return { key, delayMs, finalizeAfterMs };
}

export async function fireAlbumGroupTimer(
  channelId,
  mediaGroupId,
  { env = process.env, fetchImpl = fetch, supabase = null, now = new Date() } = {}
) {
  const key = buildRegistryKey(channelId, mediaGroupId);
  timerRegistry.delete(key);

  if (finalizeInFlightKeys.has(key)) {
    return { skipped: true, reason: "finalize_in_flight" };
  }

  finalizeInFlightKeys.add(key);
  try {
    let client = supabase;
    if (!client) {
      const { getSupabaseAdmin } = await import("../auth-session.js");
      client = getSupabaseAdmin();
    }
    if (!client) {
      return { skipped: true, reason: "supabase_unavailable" };
    }

    const { data: groupState, error } = await client
      .from("telegram_media_group_state")
      .select("*")
      .eq("telegram_channel_id", channelId)
      .eq("telegram_media_group_id", mediaGroupId)
      .maybeSingle();

    if (error) throw error;
    if (!groupState || groupState.status !== "buffering") {
      return { skipped: true, reason: "not_buffering" };
    }

    const finalizeAfterMs = parseFinalizeAfterMs(groupState.finalize_after);
    if (finalizeAfterMs > now.getTime()) {
      scheduleAlbumGroupFinalization(channelId, mediaGroupId, groupState.finalize_after, {
        env,
        fetchImpl,
        supabase: client,
      });
      return { rescheduled: true, finalizeAfter: groupState.finalize_after };
    }

    const outcome = await finalizeOneAlbumGroup(client, groupState, { env, fetchImpl, now });
    await maybeRunOperationalCleanup(client);
    return outcome;
  } finally {
    finalizeInFlightKeys.delete(key);
  }
}

export async function recoverTelegramAlbumTimersOnStartup({
  supabase = null,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (startupRecoveryPromise) {
    return startupRecoveryPromise;
  }

  startupRecoveryPromise = (async () => {
    let client = supabase;
    if (!client) {
      const { getSupabaseAdmin } = await import("../auth-session.js");
      client = getSupabaseAdmin();
    }

    if (!client) {
      return { skipped: true, reason: "supabase_unavailable", recovered: 0 };
    }

    const { data: pendingGroups, error } = await client
      .from("telegram_media_group_state")
      .select("*")
      .eq("status", "buffering");

    if (error) throw error;

    const now = new Date();
    let immediateFinalized = 0;
    let timersRestored = 0;

    for (const group of pendingGroups || []) {
      const finalizeAfterMs = parseFinalizeAfterMs(group.finalize_after);
      if (finalizeAfterMs <= now.getTime()) {
        await finalizeOneAlbumGroup(client, group, { env, fetchImpl, now });
        immediateFinalized += 1;
      } else {
        scheduleAlbumGroupFinalization(
          group.telegram_channel_id,
          group.telegram_media_group_id,
          group.finalize_after,
          { env, fetchImpl, supabase: client }
        );
        timersRestored += 1;
      }
    }

    return {
      recovered: (pendingGroups || []).length,
      immediateFinalized,
      timersRestored,
      activeTimers: timerRegistry.size,
    };
  })();

  return startupRecoveryPromise;
}

export async function runTelegramAlbumRecoverySweep({
  supabase = null,
  env = process.env,
  fetchImpl = fetch,
  forceCleanup = true,
} = {}) {
  let client = supabase;
  if (!client) {
    const { getSupabaseAdmin } = await import("../auth-session.js");
    client = getSupabaseAdmin();
  }

  if (!client) {
    return { skipped: true, reason: "supabase_unavailable" };
  }

  const now = new Date();
  const { data: dueGroups, error } = await client
    .from("telegram_media_group_state")
    .select("*")
    .eq("status", "buffering")
    .lte("finalize_after", now.toISOString());

  if (error) throw error;

  const outcomes = [];
  for (const group of dueGroups || []) {
    outcomes.push(
      await finalizeOneAlbumGroup(client, group, { env, fetchImpl, now })
    );
  }

  const cleanup = forceCleanup
    ? await runOperationalCleanup(client, {
        ingressRetentionDays: TELEGRAM_CONTENT_INGRESS_LOG_RETENTION_DAYS,
        bufferTerminalRetentionDays: TELEGRAM_CONTENT_BUFFER_TERMINAL_RETENTION_DAYS,
      })
    : await maybeRunOperationalCleanup(client, { force: true });

  return {
    finalizedGroups: outcomes.length,
    outcomes,
    cleanup,
  };
}

export async function maybeRunOperationalCleanup(supabase, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastOperationalCleanupAt < TELEGRAM_CONTENT_OPERATIONAL_CLEANUP_THROTTLE_MS) {
    return { skipped: true, reason: "throttled" };
  }

  lastOperationalCleanupAt = now;
  return runOperationalCleanup(supabase, {
    ingressRetentionDays: TELEGRAM_CONTENT_INGRESS_LOG_RETENTION_DAYS,
    bufferTerminalRetentionDays: TELEGRAM_CONTENT_BUFFER_TERMINAL_RETENTION_DAYS,
  });
}

export function logTelegramAlbumLateMember({ channelId, mediaGroupId, messageId }) {
  logApiWarning({
    route: "telegram-content/album-buffer",
    event: "telegram_album_late_member",
    channelId,
    mediaGroupId,
    messageId,
  });
}

// Test-only exports — no recurring sweep exists in production code.
export function hasRecurringAlbumSweepForTests() {
  return false;
}
