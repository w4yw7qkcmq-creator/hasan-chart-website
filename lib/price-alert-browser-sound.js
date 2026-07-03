import {
  isNotificationSoundEnabled,
  playNotificationSound,
  setupNotificationSoundUnlock,
  unlockNotificationSound,
} from "./notification-sound";
import { NOTIFICATION_TYPES } from "./notifications-shared";

export const BROWSER_SOUND_CHANNEL = "hasan-chart-browser-sound";
export const BROWSER_SOUND_MESSAGE_TYPE = "BROWSER_SOUND";

const LEGACY_PRICE_ALERT_SOUND_MESSAGE_TYPE = "PRICE_ALERT_SOUND";

export const BROWSER_SOUND_TYPES = {
  PRICE_ALERT: "price-alert",
  VIP_SIGNAL: "vip-signal",
  BREAKING_NEWS: "breaking-news",
};

const SOUND_UNLOCK_STORAGE_KEY = "hc_browser_sound_unlocked";
const LEGACY_SOUND_UNLOCK_STORAGE_KEY = "hc_price_alert_sound_unlocked";
const FALLBACK_SOUND = "/sounds/alert.wav";
const PLAYBACK_VOLUME = 0.9;
const UNLOCK_VOLUME = 0.02;
const MAX_PLAY_MS = 1200;
const DEDUP_MS = 3000;

const SOUND_PROFILES = {
  [BROWSER_SOUND_TYPES.PRICE_ALERT]: {
    primary: "/sounds/price-alert.wav",
    playedLog: "PRICE_ALERT_BROWSER_SOUND_PLAYED",
  },
  [BROWSER_SOUND_TYPES.VIP_SIGNAL]: {
    primary: "/sounds/vip-signal.wav",
    playedLog: "VIP_SIGNAL_BROWSER_SOUND_PLAYED",
  },
  [BROWSER_SOUND_TYPES.BREAKING_NEWS]: {
    primary: "/sounds/breaking-news.wav",
    playedLog: "BREAKING_NEWS_BROWSER_SOUND_PLAYED",
  },
};

let listenerInstalled = false;
let gestureUnlockAttached = false;
let htmlAudioUnlocked = false;
const lastPlayedAtByKey = new Map();
const preloadedAudioBySource = new Map();

function logBrowserSound(event, extra = {}) {
  if (Object.keys(extra).length > 0) {
    console.log(event, extra);
    return;
  }

  console.log(event);
}

function readStoredUnlockState() {
  if (typeof window === "undefined") return false;

  return (
    window.localStorage.getItem(SOUND_UNLOCK_STORAGE_KEY) === "1" ||
    window.localStorage.getItem(LEGACY_SOUND_UNLOCK_STORAGE_KEY) === "1"
  );
}

function persistUnlockState() {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(SOUND_UNLOCK_STORAGE_KEY, "1");
  htmlAudioUnlocked = true;
}

export function isPriceAlertBrowserSoundUnlocked() {
  return isBrowserSoundUnlocked();
}

export function isBrowserSoundUnlocked() {
  if (htmlAudioUnlocked) return true;
  if (readStoredUnlockState()) {
    htmlAudioUnlocked = true;
    return true;
  }

  return false;
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
  Object.values(SOUND_PROFILES).forEach((profile) => {
    getPreloadedAudio(profile.primary);
  });
  getPreloadedAudio(FALLBACK_SOUND);
}

export async function unlockPriceAlertBrowserSound() {
  return unlockBrowserSound();
}

export async function unlockBrowserSound() {
  if (typeof window === "undefined") return false;

  if (isBrowserSoundUnlocked()) {
    warmPrimarySounds();
    unlockNotificationSound();
    return true;
  }

  unlockNotificationSound();

  const unlockSources = [
    SOUND_PROFILES[BROWSER_SOUND_TYPES.PRICE_ALERT].primary,
    FALLBACK_SOUND,
  ];

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

      logBrowserSound("BROWSER_SOUND_UNLOCKED", { source });
      return true;
    } catch (_error) {
      // Try next source.
    }
  }

  return false;
}

export function setupPriceAlertBrowserSoundUnlock() {
  setupBrowserSoundUnlock();
}

export function setupBrowserSoundUnlock() {
  if (typeof window === "undefined" || gestureUnlockAttached) return;

  gestureUnlockAttached = true;
  setupNotificationSoundUnlock();

  if (isBrowserSoundUnlocked()) {
    warmPrimarySounds();
    unlockNotificationSound();
    return;
  }

  const unlockFromGesture = () => {
    void unlockBrowserSound();
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

function resolveSoundTypeFromNotificationType(notificationType) {
  switch (notificationType) {
    case NOTIFICATION_TYPES.PRICE_ALERT:
      return BROWSER_SOUND_TYPES.PRICE_ALERT;
    case NOTIFICATION_TYPES.VIP_SPOT:
    case NOTIFICATION_TYPES.VIP_FUTURES:
      return BROWSER_SOUND_TYPES.VIP_SIGNAL;
    case "breaking-news":
      return BROWSER_SOUND_TYPES.BREAKING_NEWS;
    default:
      return null;
  }
}

export function resolveBrowserSoundTypeFromPayload(payload = {}) {
  const explicit = String(payload.soundType || payload.sound_type || "").trim();
  if (explicit && SOUND_PROFILES[explicit]) {
    return explicit;
  }

  const pushType = String(payload.type || "").trim();
  const fromType = resolveSoundTypeFromNotificationType(pushType);
  if (fromType) return fromType;

  const tag = String(payload.tag || "");
  if (tag.startsWith("price-alert-")) return BROWSER_SOUND_TYPES.PRICE_ALERT;
  if (tag.startsWith("vip-signal-")) return BROWSER_SOUND_TYPES.VIP_SIGNAL;
  if (tag.startsWith("breaking-news-")) return BROWSER_SOUND_TYPES.BREAKING_NEWS;

  if (pushType === "price-alert") return BROWSER_SOUND_TYPES.PRICE_ALERT;
  if (pushType === "vip-spot" || pushType === "vip-futures") {
    return BROWSER_SOUND_TYPES.VIP_SIGNAL;
  }
  if (pushType === "breaking-news") return BROWSER_SOUND_TYPES.BREAKING_NEWS;

  return null;
}

async function playAudioSource(source, { useFallback = true } = {}) {
  const audio = getPreloadedAudio(source) || new Audio(source);
  audio.preload = "auto";
  audio.volume = PLAYBACK_VOLUME;
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

  return { source, audio };
}

async function playSoundProfile(soundType) {
  const profile = SOUND_PROFILES[soundType];
  if (!profile) {
    throw new Error(`UNKNOWN_SOUND_TYPE:${soundType}`);
  }

  try {
    return await playAudioSource(profile.primary, { useFallback: false });
  } catch (primaryError) {
    logBrowserSound("BROWSER_SOUND_FALLBACK_USED", {
      soundType,
      requested: profile.primary,
      fallback: FALLBACK_SOUND,
      reason: primaryError?.message || "primary-unavailable",
    });

    return playAudioSource(FALLBACK_SOUND);
  }
}

function blockBrowserSound({ reason, soundType, id, source }) {
  logBrowserSound("BROWSER_SOUND_BLOCKED", {
    reason,
    soundType,
    id: id || null,
    source,
  });
}

export function playBrowserSound({
  soundType,
  id = null,
  source = "site",
} = {}) {
  if (typeof window === "undefined") return;

  const profile = SOUND_PROFILES[soundType];
  if (!profile) {
    blockBrowserSound({
      reason: "unknown-sound-type",
      soundType,
      id,
      source,
    });
    return;
  }

  const dedupeKey = `${soundType}:${id || "generic"}`;

  if (!isNotificationSoundEnabled()) {
    blockBrowserSound({ reason: "disabled", soundType, id, source });
    return;
  }

  if (!isSoundPlaybackAllowed()) {
    blockBrowserSound({ reason: "tab-hidden", soundType, id, source });
    return;
  }

  if (!isBrowserSoundUnlocked()) {
    blockBrowserSound({ reason: "awaiting-user-gesture", soundType, id, source });
    return;
  }

  if (!shouldPlayNow(dedupeKey)) {
    blockBrowserSound({ reason: "deduped", soundType, id, source });
    return;
  }

  void (async () => {
    try {
      const outcome = await playSoundProfile(soundType);
      logBrowserSound(profile.playedLog, {
        id,
        source,
        asset: outcome.source,
        volume: PLAYBACK_VOLUME,
      });
    } catch (error) {
      try {
        playNotificationSound();
        logBrowserSound(profile.playedLog, {
          id,
          source,
          asset: "web-audio-tone",
          volume: PLAYBACK_VOLUME,
        });
      } catch {
        blockBrowserSound({
          reason: error?.message || "play-error",
          soundType,
          id,
          source,
        });
      }
    }
  })();
}

export function playPriceAlertBrowserSound({ alertId = null, source = "site" } = {}) {
  playBrowserSound({
    soundType: BROWSER_SOUND_TYPES.PRICE_ALERT,
    id: alertId,
    source,
  });
}

export function playVipSignalBrowserSound({ signalId = null, source = "site" } = {}) {
  playBrowserSound({
    soundType: BROWSER_SOUND_TYPES.VIP_SIGNAL,
    id: signalId,
    source,
  });
}

export function playBreakingNewsBrowserSound({ newsId = null, source = "site" } = {}) {
  playBrowserSound({
    soundType: BROWSER_SOUND_TYPES.BREAKING_NEWS,
    id: newsId,
    source,
  });
}

export function playBrowserSoundForNotificationType({
  notificationType,
  id = null,
  source = "site-notification",
} = {}) {
  const soundType = resolveSoundTypeFromNotificationType(notificationType);
  if (!soundType) return;

  playBrowserSound({ soundType, id, source });
}

function isBrowserSoundMessage(data) {
  if (!data || data.sound !== true) return false;

  if (data.type === BROWSER_SOUND_MESSAGE_TYPE) return true;
  if (data.type === LEGACY_PRICE_ALERT_SOUND_MESSAGE_TYPE) return true;
  if (data.type === "price-alert") return true;

  return Boolean(resolveBrowserSoundTypeFromPayload(data));
}

function handleBrowserSoundMessage(data, channelSource) {
  if (!isBrowserSoundMessage(data)) {
    return;
  }

  const soundType = resolveBrowserSoundTypeFromPayload(data);
  if (!soundType) return;

  playBrowserSound({
    soundType,
    id: data.alertId || data.signalId || data.newsId || data.id || null,
    source: channelSource,
  });
}

export function installPriceAlertBrowserSoundListener() {
  return installBrowserSoundListener();
}

export function installBrowserSoundListener() {
  if (typeof window === "undefined" || listenerInstalled) {
    return () => {};
  }

  listenerInstalled = true;
  setupBrowserSoundUnlock();

  const broadcastChannel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(BROWSER_SOUND_CHANNEL)
      : null;

  const legacyBroadcastChannel =
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
  legacyBroadcastChannel?.addEventListener("message", onBroadcastMessage);
  navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
  window.addEventListener("message", onWindowMessage);

  return () => {
    broadcastChannel?.removeEventListener("message", onBroadcastMessage);
    broadcastChannel?.close();
    legacyBroadcastChannel?.removeEventListener("message", onBroadcastMessage);
    legacyBroadcastChannel?.close();
    navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    window.removeEventListener("message", onWindowMessage);
    listenerInstalled = false;
  };
}
