import { NOTIFICATION_TYPES } from "./notifications-shared.js";
import {
  getNotificationKeyPreference,
} from "./notification-sound-settings-shared.js";
import {
  getActiveNotificationKeyVolume,
  getActiveNotificationSoundSettings,
  getNotificationSoundSettingsMode,
  isNotificationKeySoundEnabled,
  isNotificationSoundMasterEnabled,
  patchActiveNotificationSoundSettings,
} from "./notification-sound-settings-store.js";
import {
  LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY,
  NOTIFICATION_SOUND_KEY_ORDER,
  NOTIFICATION_SOUND_KEYS,
  normalizeNotificationKey,
  resolveNotificationKeyFromSiteType,
  resolveNotificationKeyFromSource,
  resolveSoundAssetPath,
} from "./notification-sound-keys.js";

/** @deprecated Use NOTIFICATION_SOUND_KEYS from notification-sound-keys.js */
export const NOTIFICATION_SOUND_TYPES = {
  PRICE_ALERT: "price-alert",
  VIP_SIGNAL: "vip-signal",
  BREAKING_NEWS: "breaking-news",
  DEFAULT: "default",
};

export const NOTIFICATION_SOUND_STORAGE_KEYS = {
  ENABLED: "notification_sound_enabled",
  VOLUME: "notification_sound_volume",
  UNLOCKED: "notification_sound_unlocked",
};

const LEGACY_STORAGE_KEYS = {
  ENABLED: "hc_notification_sound_enabled",
  UNLOCKED: "hc_browser_sound_unlocked",
  PRICE_ALERT_UNLOCKED: "hc_price_alert_sound_unlocked",
};

export const BROWSER_SOUND_CHANNEL = "hasan-chart-browser-sound";
export const BROWSER_SOUND_MESSAGE_TYPE = "BROWSER_SOUND";

const LEGACY_PRICE_ALERT_SOUND_MESSAGE_TYPE = "PRICE_ALERT_SOUND";
const TRADING_ALERT_SOUND = "/sounds/trading-alert.wav";
const FALLBACK_SOUND = "/sounds/alert.wav";
const SHARED_SOUND_SOURCES = [TRADING_ALERT_SOUND, FALLBACK_SOUND];
const DEFAULT_VOLUME = 0.9;
const MAX_PLAY_MS = 1200;
const DEDUP_MS = 3000;

let listenerInstalled = false;
let gestureUnlockAttached = false;
let gestureUnlockHandlers = null;
/** Source of truth: only true after a successful in-session gesture unlock. */
let memoryAudioUnlocked = false;
let unlockInProgress = null;
let audioContext = null;
const lastPlayedAtByKey = new Map();
/** @type {Map<string, { audio: HTMLAudioElement, unlocked: boolean }>} */
const sharedAudioBySource = new Map();
/** @type {Map<string, AudioBuffer>} */
const decodedBuffersBySource = new Map();

function logNotificationSound(event, extra = {}) {
  if (Object.keys(extra).length > 0) {
    console.log(event, extra);
    return;
  }

  console.log(event);
}

function readStoredString(key) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeStoredString(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function migrateLegacySettings() {
  if (typeof window === "undefined") return;

  if (readStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.ENABLED) === null) {
    const legacyEnabled = readStoredString(LEGACY_STORAGE_KEYS.ENABLED);
    if (legacyEnabled !== null) {
      writeStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.ENABLED, legacyEnabled);
    }
  }

  if (readStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.UNLOCKED) === null) {
    const legacyUnlocked =
      readStoredString(LEGACY_STORAGE_KEYS.UNLOCKED) === "1" ||
      readStoredString(LEGACY_STORAGE_KEYS.PRICE_ALERT_UNLOCKED) === "1";

    if (legacyUnlocked) {
      writeStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.UNLOCKED, "1");
    }
  }
}

export function isNotificationSoundEnabled() {
  if (typeof window === "undefined") return false;

  migrateLegacySettings();

  if (getNotificationSoundSettingsMode() === "guest") {
    const stored = readStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.ENABLED);
    if (stored === "0" || stored === "false") {
      return false;
    }
  }

  return isNotificationSoundMasterEnabled();
}

export function setNotificationSoundEnabled(enabled) {
  if (typeof window === "undefined") return;

  writeStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.ENABLED, enabled ? "1" : "0");
  patchActiveNotificationSoundSettings({ sound_enabled: enabled });
}

export function getNotificationSoundVolume() {
  if (typeof window === "undefined") return DEFAULT_VOLUME;

  migrateLegacySettings();

  if (getNotificationSoundSettingsMode() === "guest") {
    const stored = readStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.VOLUME);
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }

  return getActiveNotificationSoundSettings().sound_volume ?? DEFAULT_VOLUME;
}

export function setNotificationSoundVolume(volume) {
  if (typeof window === "undefined") return;

  const normalized = Math.max(0, Math.min(1, Number(volume)));
  if (!Number.isFinite(normalized)) return;

  writeStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.VOLUME, String(normalized));
  patchActiveNotificationSoundSettings({ sound_volume: normalized });
}

function persistUnlockState() {
  if (typeof window === "undefined") return;

  memoryAudioUnlocked = true;
  writeStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.UNLOCKED, "1");
}

export function isNotificationSoundUnlocked() {
  return memoryAudioUnlocked;
}

export function isBrowserSoundUnlocked() {
  return isNotificationSoundUnlocked();
}

export function isPriceAlertBrowserSoundUnlocked() {
  return isNotificationSoundUnlocked();
}

function getOrCreateSharedAudio(source) {
  if (typeof window === "undefined") return null;

  if (!sharedAudioBySource.has(source)) {
    const audio = new Audio(source);
    audio.preload = "auto";
    sharedAudioBySource.set(source, { audio, unlocked: false });
  }

  return sharedAudioBySource.get(source);
}

function ensureSharedAudioInstances() {
  for (const source of SHARED_SOUND_SOURCES) {
    getOrCreateSharedAudio(source);
  }
}

async function ensureAudioContext() {
  if (typeof window === "undefined") return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return audioContext;
}

async function preloadWebAudioBuffer(source) {
  if (decodedBuffersBySource.has(source)) {
    return decodedBuffersBySource.get(source);
  }

  const ctx = await ensureAudioContext();
  if (!ctx) {
    throw new Error("AUDIO_CONTEXT_UNAVAILABLE");
  }

  const response = await fetch(source, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`FETCH_AUDIO_FAILED:${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  decodedBuffersBySource.set(source, audioBuffer);
  return audioBuffer;
}

async function unlockSharedAudioInstance(source) {
  const entry = getOrCreateSharedAudio(source);
  if (!entry) {
    throw new Error("SHARED_AUDIO_UNAVAILABLE");
  }

  const { audio } = entry;

  audio.preload = "auto";
  audio.muted = true;
  audio.volume = 0;
  audio.currentTime = 0;

  const playPromise = audio.play();
  await playPromise;

  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;

  entry.unlocked = true;
  return entry;
}

async function performNotificationAudioUnlock() {
  if (typeof window === "undefined") return false;

  if (memoryAudioUnlocked) {
    return true;
  }

  if (unlockInProgress) {
    return unlockInProgress;
  }

  logNotificationSound("NOTIFICATION_AUDIO_UNLOCK_START", {
    sources: SHARED_SOUND_SOURCES,
  });

  unlockInProgress = (async () => {
    ensureSharedAudioInstances();

    let unlockedCount = 0;
    const failures = [];

    for (const source of SHARED_SOUND_SOURCES) {
      try {
        await unlockSharedAudioInstance(source);
        unlockedCount += 1;
      } catch (error) {
        failures.push({
          source,
          error: error?.message || String(error),
        });
      }

      try {
        await preloadWebAudioBuffer(source);
      } catch (error) {
        failures.push({
          source,
          channel: "web-audio-preload",
          error: error?.message || String(error),
        });
      }
    }

    try {
      await ensureAudioContext();
    } catch (error) {
      failures.push({
        channel: "audio-context",
        error: error?.message || String(error),
      });
    }

    if (unlockedCount > 0) {
      persistUnlockState();
      detachGestureUnlockHandlers();
      logNotificationSound("NOTIFICATION_AUDIO_UNLOCK_SUCCESS", {
        unlockedCount,
        sources: SHARED_SOUND_SOURCES.filter((source) =>
          sharedAudioBySource.get(source)?.unlocked
        ),
        webAudioBuffers: decodedBuffersBySource.size,
      });
      return true;
    }

    logNotificationSound("NOTIFICATION_AUDIO_UNLOCK_FAILED", {
      failures,
    });
    return false;
  })().finally(() => {
    unlockInProgress = null;
  });

  return unlockInProgress;
}

function detachGestureUnlockHandlers() {
  if (!gestureUnlockHandlers || typeof document === "undefined") return;

  document.removeEventListener("click", gestureUnlockHandlers.click, true);
  document.removeEventListener("pointerdown", gestureUnlockHandlers.pointerdown, true);
  document.removeEventListener("keydown", gestureUnlockHandlers.keydown, true);
  gestureUnlockHandlers = null;
  gestureUnlockAttached = false;
}

export async function unlockNotificationSound() {
  return performNotificationAudioUnlock();
}

export async function unlockBrowserSound() {
  return unlockNotificationSound();
}

export async function unlockPriceAlertBrowserSound() {
  return unlockNotificationSound();
}

export function setupNotificationSoundUnlock() {
  setupBrowserSoundUnlock();
}

export function setupBrowserSoundUnlock() {
  if (typeof window === "undefined" || gestureUnlockAttached) return;

  gestureUnlockAttached = true;

  if (memoryAudioUnlocked) {
    ensureSharedAudioInstances();
    return;
  }

  const unlockFromGesture = () => {
    void performNotificationAudioUnlock();
  };

  gestureUnlockHandlers = {
    click: unlockFromGesture,
    pointerdown: unlockFromGesture,
    keydown: unlockFromGesture,
  };

  document.addEventListener("click", gestureUnlockHandlers.click, {
    capture: true,
    passive: true,
  });
  document.addEventListener("pointerdown", gestureUnlockHandlers.pointerdown, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", gestureUnlockHandlers.keydown, {
    capture: true,
  });
}

export function setupPriceAlertBrowserSoundUnlock() {
  setupBrowserSoundUnlock();
}

function isSoundPlaybackAllowed() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && !document.hidden;
}

function shouldPlayNow(dedupeKey) {
  const now = Date.now();
  const lastPlayedAt = lastPlayedAtByKey.get(dedupeKey) || 0;

  if (now - lastPlayedAt < DEDUP_MS) {
    return false;
  }

  lastPlayedAtByKey.set(dedupeKey, now);
  return true;
}

export function resolveNotificationKeyFromNotificationType(notificationType) {
  return resolveNotificationKeyFromSiteType(notificationType);
}

/** @deprecated Use resolveNotificationKeyFromNotificationType */
export function resolveSoundTypeFromNotificationType(notificationType) {
  const key = resolveNotificationKeyFromSiteType(notificationType);
  const legacyEntry = Object.entries(LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY).find(
    ([, value]) => value === key
  );

  return legacyEntry?.[0] || NOTIFICATION_SOUND_TYPES.DEFAULT;
}

export function resolveNotificationKeyFromPayload(payload = {}) {
  const explicitKey = String(
    payload.notificationKey || payload.notification_key || ""
  ).trim();

  if (explicitKey) {
    return normalizeNotificationKey(explicitKey);
  }

  const sourceKey = resolveNotificationKeyFromSource(payload.source);
  if (sourceKey) {
    return sourceKey;
  }

  const explicitLegacyType = String(payload.soundType || payload.sound_type || "").trim();
  if (explicitLegacyType && LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY[explicitLegacyType]) {
    return LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY[explicitLegacyType];
  }

  const pushType = String(payload.type || "").trim();
  if (pushType && pushType !== BROWSER_SOUND_MESSAGE_TYPE) {
    return resolveNotificationKeyFromSiteType(pushType);
  }

  const tag = String(payload.tag || "");
  if (tag.startsWith("price-alert-")) return NOTIFICATION_SOUND_KEYS.PRICE_ALERT;
  if (tag.startsWith("vip-signal-")) return NOTIFICATION_SOUND_KEYS.VIP_SIGNAL;
  if (tag.startsWith("breaking-news-")) return NOTIFICATION_SOUND_KEYS.BREAKING_NEWS;

  return null;
}

/** @deprecated Use resolveNotificationKeyFromPayload */
export function resolveBrowserSoundTypeFromPayload(payload = {}) {
  const key = resolveNotificationKeyFromPayload(payload);
  if (!key) return null;

  const legacyEntry = Object.entries(LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY).find(
    ([, value]) => value === key
  );

  return legacyEntry?.[0] || null;
}

function resolvePlayOptions(notificationKeyOrOptions, maybeOptions = {}) {
  if (typeof notificationKeyOrOptions === "string") {
    return {
      notificationKey: normalizeNotificationKey(notificationKeyOrOptions),
      id: maybeOptions.id ?? null,
      source: maybeOptions.source ?? "site",
    };
  }

  const opts = notificationKeyOrOptions || {};

  if (opts.notificationKey || opts.notification_key) {
    return {
      notificationKey: normalizeNotificationKey(opts.notificationKey || opts.notification_key),
      id: opts.id ?? null,
      source: opts.source ?? "site",
    };
  }

  if (opts.soundType) {
    const legacyKey = LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY[opts.soundType];
    return {
      notificationKey: legacyKey || normalizeNotificationKey(opts.soundType),
      id: opts.id ?? null,
      source: opts.source ?? "site",
    };
  }

  if (opts.notificationType) {
    return {
      notificationKey: resolveNotificationKeyFromSiteType(opts.notificationType),
      id: opts.id ?? null,
      source: opts.source ?? "site",
    };
  }

  const fromPayload = resolveNotificationKeyFromPayload(opts);
  return {
    notificationKey: fromPayload || NOTIFICATION_SOUND_KEYS.SYSTEM,
    id: opts.id ?? null,
    source: opts.source ?? "site",
  };
}

function getSoundAssetForNotificationKey(notificationKey) {
  const settings = getActiveNotificationSoundSettings();
  const preference = getNotificationKeyPreference(settings, notificationKey);
  return resolveSoundAssetPath(preference.sound);
}

async function playSharedAudioSource(source, volume) {
  if (!memoryAudioUnlocked) {
    throw new Error("awaiting-user-gesture");
  }

  const entry = sharedAudioBySource.get(source);
  if (!entry?.unlocked) {
    throw new Error("shared-audio-not-unlocked");
  }

  const { audio } = entry;

  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = volume;

  const playPromise = audio.play();
  const timeoutPromise = new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error("AUDIO_PLAY_TIMEOUT")), MAX_PLAY_MS + 250);
  });

  await Promise.race([playPromise, timeoutPromise]);

  window.setTimeout(() => {
    audio.pause();
    audio.currentTime = 0;
  }, MAX_PLAY_MS);

  return { source, audio, volume, engine: "shared-html-audio" };
}

async function playWebAudioSource(source, volume) {
  const ctx = await ensureAudioContext();
  if (!ctx) {
    throw new Error("AUDIO_CONTEXT_UNAVAILABLE");
  }

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const buffer =
    decodedBuffersBySource.get(source) || (await preloadWebAudioBuffer(source));

  await new Promise((resolve, reject) => {
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceNode.onended = () => resolve();
    sourceNode.onerror = () => reject(new Error("WEB_AUDIO_SOURCE_ERROR"));

    try {
      sourceNode.start(0);
    } catch (error) {
      reject(error);
    }

    window.setTimeout(() => {
      try {
        sourceNode.stop();
      } catch (_error) {
        // Already ended.
      }
      resolve();
    }, MAX_PLAY_MS);
  });

  return { source, volume, engine: "web-audio-api" };
}

async function playAudioSource(source, volume, { notificationKey = null } = {}) {
  logNotificationSound("NOTIFICATION_SOUND_PLAY_ATTEMPT", {
    source,
    volume,
    notificationKey,
    sharedInstance: Boolean(sharedAudioBySource.get(source)?.unlocked),
    memoryUnlocked: memoryAudioUnlocked,
  });

  try {
    return await playSharedAudioSource(source, volume);
  } catch (sharedError) {
    logNotificationSound("NOTIFICATION_SOUND_BLOCKED", {
      reason: "shared-html-audio-failed",
      source,
      notificationKey,
      error: sharedError?.message || String(sharedError),
    });

    return playWebAudioSource(source, volume);
  }
}

async function playNotificationKeySound(notificationKey) {
  const primary = getSoundAssetForNotificationKey(notificationKey);
  const volume = getActiveNotificationKeyVolume(notificationKey);

  try {
    return await playAudioSource(primary, volume, { notificationKey });
  } catch (primaryError) {
    logNotificationSound("NOTIFICATION_SOUND_BLOCKED", {
      reason: "primary-failed-using-fallback",
      notificationKey,
      requested: primary,
      fallback: FALLBACK_SOUND,
      error: primaryError?.message || "primary-unavailable",
    });

    return playAudioSource(FALLBACK_SOUND, volume, { notificationKey });
  }
}

function blockNotificationSound({ reason, notificationKey, id, source }) {
  logNotificationSound("NOTIFICATION_SOUND_BLOCKED", {
    reason,
    notificationKey,
    id: id || null,
    source,
  });

  if (normalizeNotificationKey(notificationKey) === NOTIFICATION_SOUND_KEYS.PRICE_ALERT) {
    console.log("PRICE_ALERT_DUPLICATE_SKIPPED", {
      reason,
      id: id || null,
      source,
      stage: "playNotificationSound",
    });
  }
}

export function playNotificationSound(notificationKeyOrOptions, maybeOptions = {}) {
  if (typeof window === "undefined") return;

  const { notificationKey, id, source } = resolvePlayOptions(
    notificationKeyOrOptions,
    maybeOptions
  );

  let resolvedKey = normalizeNotificationKey(notificationKey);
  if (source === "admin-dashboard" && resolvedKey === NOTIFICATION_SOUND_KEYS.SYSTEM) {
    resolvedKey = NOTIFICATION_SOUND_KEYS.ADMIN;
  }

  resolvedKey = normalizeNotificationKey(resolvedKey);

  logNotificationSound("NOTIFICATION_SOUND_KEY_RESOLVED", {
    requested: notificationKeyOrOptions,
    rawKey: notificationKey,
    resolvedKey,
    id: id || null,
    source,
  });

  logNotificationSound("NOTIFICATION_SOUND_TYPE", {
    requested: notificationKeyOrOptions,
    resolved: resolvedKey,
    notificationKey: resolvedKey,
    id: id || null,
    source,
  });

  const dedupeKey = `${resolvedKey}:${id || "generic"}`;

  if (!isNotificationSoundEnabled()) {
    blockNotificationSound({
      reason: "disabled",
      notificationKey: resolvedKey,
      id,
      source,
    });
    return;
  }

  if (!isNotificationKeySoundEnabled(resolvedKey)) {
    blockNotificationSound({
      reason: "type-disabled",
      notificationKey: resolvedKey,
      id,
      source,
    });
    return;
  }

  if (!isSoundPlaybackAllowed()) {
    blockNotificationSound({
      reason: "tab-hidden",
      notificationKey: resolvedKey,
      id,
      source,
    });
    return;
  }

  if (!isNotificationSoundUnlocked()) {
    blockNotificationSound({
      reason: "awaiting-user-gesture",
      notificationKey: resolvedKey,
      id,
      source,
    });
    return;
  }

  if (!shouldPlayNow(dedupeKey)) {
    blockNotificationSound({
      reason: "deduped",
      notificationKey: resolvedKey,
      id,
      source,
    });
    return;
  }

  void (async () => {
    try {
      const outcome = await playNotificationKeySound(resolvedKey);
      logNotificationSound("NOTIFICATION_SOUND_PLAYED", {
        notificationKey: resolvedKey,
        id,
        source,
        asset: outcome.source,
        volume: outcome.volume,
        engine: outcome.engine,
      });

      if (resolvedKey === NOTIFICATION_SOUND_KEYS.PRICE_ALERT) {
        console.log("PRICE_ALERT_SOUND_PLAYED", {
          id: id || null,
          source,
          asset: outcome.source,
          volume: outcome.volume,
          engine: outcome.engine,
        });
      }
    } catch (error) {
      blockNotificationSound({
        reason: error?.message || "play-error",
        notificationKey: resolvedKey,
        id,
        source,
      });
    }
  })();
}

export function playBrowserSound(options = {}) {
  console.log("NOTIFICATION_SOUND_LEGACY_PATH_SKIPPED", {
    reason: "use-notification-center-realtime",
    options,
    legacyFunction: "playBrowserSound",
  });
}

export function playPriceAlertBrowserSound({ alertId = null, source = "site" } = {}) {
  console.log("NOTIFICATION_SOUND_LEGACY_PATH_SKIPPED", {
    reason: "use-notification-center-realtime",
    alertId,
    source,
    legacyFunction: "playPriceAlertBrowserSound",
  });
}

export function playVipSignalBrowserSound({ signalId = null, source = "site" } = {}) {
  console.log("NOTIFICATION_SOUND_LEGACY_PATH_SKIPPED", {
    reason: "use-notification-center-realtime",
    signalId,
    source,
    legacyFunction: "playVipSignalBrowserSound",
  });
}

export function playBreakingNewsBrowserSound({ newsId = null, source = "site" } = {}) {
  console.log("NOTIFICATION_SOUND_LEGACY_PATH_SKIPPED", {
    reason: "use-notification-center-realtime",
    newsId,
    source,
    legacyFunction: "playBreakingNewsBrowserSound",
  });
}

export function playBrowserSoundForNotificationType({
  notificationType,
  id = null,
  source = "site-notification",
} = {}) {
  console.log("NOTIFICATION_SOUND_LEGACY_PATH_SKIPPED", {
    reason: "use-notification-center-realtime",
    notificationType,
    id,
    source,
    legacyFunction: "playBrowserSoundForNotificationType",
  });
}

function isBrowserSoundMessage(data) {
  if (!data || data.sound !== true) return false;

  if (data.type === BROWSER_SOUND_MESSAGE_TYPE) return true;
  if (data.type === LEGACY_PRICE_ALERT_SOUND_MESSAGE_TYPE) return true;
  if (data.type === "price-alert") return true;
  if (data.notificationKey || data.notification_key) return true;

  return Boolean(resolveNotificationKeyFromPayload(data));
}

function handleBrowserSoundMessage(data, channelSource) {
  if (!isBrowserSoundMessage(data)) {
    return;
  }

  console.log("NOTIFICATION_SOUND_LEGACY_PATH_SKIPPED", {
    reason: "notification-center-handles-sound",
    channelSource,
    type: data.type || null,
    alertId: data.alertId || null,
    signalId: data.signalId || null,
    newsId: data.newsId || null,
  });
}

export function installNotificationSoundListener() {
  if (typeof window === "undefined" || listenerInstalled) {
    return () => {};
  }

  listenerInstalled = true;
  setupBrowserSoundUnlock();

  const broadcastChannel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(BROWSER_SOUND_CHANNEL)
      : null;

  const onBroadcastMessage = (event) => {
    handleBrowserSoundMessage(event.data, "broadcast-channel");
  };

  const onServiceWorkerMessage = (event) => {
    handleBrowserSoundMessage(event.data, "service-worker-message");
  };

  const onWindowMessage = (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== navigator.serviceWorker?.controller) return;
    handleBrowserSoundMessage(event.data, "service-worker-message");
  };

  broadcastChannel?.addEventListener("message", onBroadcastMessage);
  navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
  window.addEventListener("message", onWindowMessage);

  return () => {
    broadcastChannel?.removeEventListener("message", onBroadcastMessage);
    broadcastChannel?.close();
    navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    window.removeEventListener("message", onWindowMessage);
    listenerInstalled = false;
  };
}

export function installBrowserSoundListener() {
  return installNotificationSoundListener();
}

export function installPriceAlertBrowserSoundListener() {
  return installNotificationSoundListener();
}

export function installNotificationSoundTestHook() {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.testNotificationSound = (notificationKey = NOTIFICATION_SOUND_KEYS.SYSTEM) => {
    playNotificationSound(notificationKey, {
      id: `test-${Date.now()}`,
      source: "test-hook",
    });
  };

  window.testAllNotificationSounds = () => {
    NOTIFICATION_SOUND_KEY_ORDER.forEach((notificationKey, index) => {
      window.setTimeout(() => {
        playNotificationSound(notificationKey, {
          id: `test-${notificationKey}-${Date.now()}`,
          source: "test-hook-all",
        });
      }, index * 900);
    });
  };

  return () => {
    delete window.testNotificationSound;
    delete window.testAllNotificationSounds;
  };
}

export const BROWSER_SOUND_TYPES = NOTIFICATION_SOUND_TYPES;

export { NOTIFICATION_SOUND_KEYS };
