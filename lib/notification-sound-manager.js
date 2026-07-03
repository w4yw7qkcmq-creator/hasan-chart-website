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
const DEFAULT_VOLUME = 0.9;
const UNLOCK_VOLUME = 0.02;
const MAX_PLAY_MS = 1200;
const DEDUP_MS = 3000;

let listenerInstalled = false;
let gestureUnlockAttached = false;
let htmlAudioUnlocked = false;
const lastPlayedAtByKey = new Map();
const preloadedAudioBySource = new Map();

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

function readStoredUnlockState() {
  if (typeof window === "undefined") return false;

  migrateLegacySettings();
  return readStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.UNLOCKED) === "1";
}

function persistUnlockState() {
  if (typeof window === "undefined") return;

  writeStoredString(NOTIFICATION_SOUND_STORAGE_KEYS.UNLOCKED, "1");
  htmlAudioUnlocked = true;
}

export function isNotificationSoundUnlocked() {
  if (htmlAudioUnlocked) return true;

  if (readStoredUnlockState()) {
    htmlAudioUnlocked = true;
    return true;
  }

  return false;
}

export function isBrowserSoundUnlocked() {
  return isNotificationSoundUnlocked();
}

export function isPriceAlertBrowserSoundUnlocked() {
  return isNotificationSoundUnlocked();
}

function getPreloadedAudio(source) {
  if (typeof window === "undefined") return null;

  if (!preloadedAudioBySource.has(source)) {
    const audio = new Audio(source);
    audio.preload = "auto";
    preloadedAudioBySource.set(source, audio);
  }

  return preloadedAudioBySource.get(source);
}

function warmPrimarySounds() {
  getPreloadedAudio(TRADING_ALERT_SOUND);
  getPreloadedAudio(FALLBACK_SOUND);
}

export async function unlockNotificationSound() {
  if (typeof window === "undefined") return false;

  if (isNotificationSoundUnlocked()) {
    warmPrimarySounds();
    return true;
  }

  const unlockSources = [TRADING_ALERT_SOUND, FALLBACK_SOUND];

  for (const source of unlockSources) {
    try {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.volume = UNLOCK_VOLUME;

      await audio.play();
      audio.pause();
      audio.currentTime = 0;

      preloadedAudioBySource.set(source, audio);
      persistUnlockState();
      warmPrimarySounds();

      logNotificationSound("NOTIFICATION_SOUND_UNLOCKED", { source });
      return true;
    } catch (_error) {
      // Try next source.
    }
  }

  return false;
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

  if (isNotificationSoundUnlocked()) {
    warmPrimarySounds();
    return;
  }

  const unlockFromGesture = () => {
    void unlockNotificationSound();
  };

  document.addEventListener("click", unlockFromGesture, {
    once: true,
    capture: true,
    passive: true,
  });
  document.addEventListener("pointerdown", unlockFromGesture, {
    once: true,
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", unlockFromGesture, {
    once: true,
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

async function playAudioSource(source, volume) {
  const audio = getPreloadedAudio(source) || new Audio(source);
  audio.preload = "auto";
  audio.volume = volume;
  audio.currentTime = 0;

  const playPromise = audio.play();
  const timeoutPromise = new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error("AUDIO_PLAY_TIMEOUT")), MAX_PLAY_MS + 250);
  });

  await Promise.race([playPromise, timeoutPromise]);

  window.setTimeout(() => {
    audio.pause();
    audio.currentTime = 0;
  }, MAX_PLAY_MS);

  return { source, audio, volume };
}

async function playNotificationKeySound(notificationKey) {
  const primary = getSoundAssetForNotificationKey(notificationKey);

  try {
    const volume = getActiveNotificationKeyVolume(notificationKey);
    return await playAudioSource(primary, volume);
  } catch (primaryError) {
    logNotificationSound("NOTIFICATION_SOUND_BLOCKED", {
      reason: "primary-failed-using-fallback",
      notificationKey,
      requested: primary,
      fallback: FALLBACK_SOUND,
      error: primaryError?.message || "primary-unavailable",
    });

    const volume = getActiveNotificationKeyVolume(notificationKey);
    return playAudioSource(FALLBACK_SOUND, volume);
  }
}

function blockNotificationSound({ reason, notificationKey, id, source }) {
  logNotificationSound("NOTIFICATION_SOUND_BLOCKED", {
    reason,
    notificationKey,
    id: id || null,
    source,
  });
}

export function playNotificationSound(notificationKeyOrOptions, maybeOptions = {}) {
  if (typeof window === "undefined") return;

  const { notificationKey, id, source } = resolvePlayOptions(
    notificationKeyOrOptions,
    maybeOptions
  );

  let resolvedKey = notificationKey;
  if (source === "admin-dashboard" && resolvedKey === NOTIFICATION_SOUND_KEYS.SYSTEM) {
    resolvedKey = NOTIFICATION_SOUND_KEYS.ADMIN;
  }

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
      });
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
  playNotificationSound(options);
}

export function playPriceAlertBrowserSound({ alertId = null, source = "site" } = {}) {
  playNotificationSound(NOTIFICATION_SOUND_KEYS.PRICE_ALERT, {
    id: alertId,
    source,
  });
}

export function playVipSignalBrowserSound({ signalId = null, source = "site" } = {}) {
  playNotificationSound(NOTIFICATION_SOUND_KEYS.VIP_SIGNAL, {
    id: signalId,
    source,
  });
}

export function playBreakingNewsBrowserSound({ newsId = null, source = "site" } = {}) {
  playNotificationSound(NOTIFICATION_SOUND_KEYS.BREAKING_NEWS, {
    id: newsId,
    source,
  });
}

export function playBrowserSoundForNotificationType({
  notificationType,
  id = null,
  source = "site-notification",
} = {}) {
  playNotificationSound(resolveNotificationKeyFromSiteType(notificationType), {
    id,
    source,
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

  const notificationKey =
    resolveNotificationKeyFromPayload(data) || NOTIFICATION_SOUND_KEYS.SYSTEM;

  playNotificationSound(notificationKey, {
    id: data.alertId || data.signalId || data.newsId || data.id || null,
    source: channelSource,
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
