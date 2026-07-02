import {
  isNotificationSoundEnabled,
  playNotificationSound,
  setupNotificationSoundUnlock,
  unlockNotificationSound,
} from "./notification-sound";

export const PRICE_ALERT_PUSH_CHANNEL = "hasan-chart-price-alert";

const SOUND_SOURCES = ["/sounds/alert.mp3", "/sounds/alert.wav"];
const DEDUP_MS = 3000;

let listenerInstalled = false;
let lastPlayedAt = 0;
let lastPlayedKey = "";

function logPriceAlertSound(event, extra = {}) {
  if (Object.keys(extra).length > 0) {
    console.log(event, extra);
    return;
  }

  console.log(event);
}

function isSoundPlaybackAllowed() {
  if (typeof document === "undefined") return false;

  return document.visibilityState === "visible" && !document.hidden;
}

function shouldPlayNow(dedupeKey) {
  const now = Date.now();

  if (now - lastPlayedAt < DEDUP_MS) {
    return false;
  }

  lastPlayedKey = String(dedupeKey || "price-alert");
  lastPlayedAt = now;
  return true;
}

function playToneFallback() {
  playNotificationSound();
}

async function playAudioFile(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.preload = "auto";

    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };

    const onEnded = () => {
      cleanup();
      resolve(true);
    };

    const onError = () => {
      cleanup();
      reject(new Error(`AUDIO_LOAD_FAILED:${url}`));
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    void audio
      .play()
      .then(() => {})
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}

async function playAlertAssetSound() {
  let lastError = null;

  for (const source of SOUND_SOURCES) {
    try {
      await playAudioFile(source);
      return { source };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("AUDIO_SOURCES_UNAVAILABLE");
}

export function playPriceAlertBrowserSound({ alertId = null, source = "site" } = {}) {
  if (typeof window === "undefined") return;

  const dedupeKey = alertId ? `price-alert:${alertId}` : "price-alert";

  if (!isNotificationSoundEnabled()) {
    logPriceAlertSound("PRICE_ALERT_BROWSER_SOUND_BLOCKED", {
      reason: "disabled",
      alertId,
      source,
    });
    return;
  }

  if (!isSoundPlaybackAllowed()) {
    logPriceAlertSound("PRICE_ALERT_BROWSER_SOUND_BLOCKED", {
      reason: "tab-hidden",
      alertId,
      source,
    });
    return;
  }

  if (!shouldPlayNow(dedupeKey)) {
    logPriceAlertSound("PRICE_ALERT_BROWSER_SOUND_BLOCKED", {
      reason: "deduped",
      alertId,
      source,
    });
    return;
  }

  unlockNotificationSound();

  void (async () => {
    try {
      const outcome = await playAlertAssetSound();
      logPriceAlertSound("PRICE_ALERT_BROWSER_SOUND_PLAYED", {
        alertId,
        source,
        asset: outcome.source,
      });
    } catch (error) {
      try {
        playToneFallback();
        logPriceAlertSound("PRICE_ALERT_BROWSER_SOUND_PLAYED", {
          alertId,
          source,
          asset: "web-audio-tone",
        });
      } catch {
        logPriceAlertSound("PRICE_ALERT_BROWSER_SOUND_BLOCKED", {
          reason: error?.message || "play-error",
          alertId,
          source,
        });
      }
    }
  })();
}

function handlePriceAlertPushMessage(data, channelSource) {
  if (!data || data.type !== "price-alert" || data.sound !== true) {
    return;
  }

  playPriceAlertBrowserSound({
    alertId: data.alertId || null,
    source: channelSource,
  });
}

export function installPriceAlertBrowserSoundListener() {
  if (typeof window === "undefined" || listenerInstalled) {
    return () => {};
  }

  listenerInstalled = true;
  setupNotificationSoundUnlock();

  const broadcastChannel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(PRICE_ALERT_PUSH_CHANNEL)
      : null;

  const onBroadcastMessage = (event) => {
    handlePriceAlertPushMessage(event.data, "broadcast-channel");
  };

  const onServiceWorkerMessage = (event) => {
    handlePriceAlertPushMessage(event.data, "service-worker-message");
  };

  broadcastChannel?.addEventListener("message", onBroadcastMessage);
  navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

  return () => {
    broadcastChannel?.removeEventListener("message", onBroadcastMessage);
    broadcastChannel?.close();
    navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    listenerInstalled = false;
  };
}
