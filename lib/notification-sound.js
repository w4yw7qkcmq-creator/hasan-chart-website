const STORAGE_KEY = "hc_notification_sound_enabled";

let audioContext = null;
let gestureUnlockAttached = false;
let soundUnlocked = false;

function logSoundEvent(event, extra = {}) {
  if (Object.keys(extra).length > 0) {
    console.log(event, extra);
    return;
  }

  console.log(event);
}

export function isNotificationSoundEnabled() {
  if (typeof window === "undefined") return false;

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (stored === "0" || stored === "false") {
    return false;
  }

  return true;
}

/** Ready for future user settings UI. */
export function setNotificationSoundEnabled(enabled) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  return audioContext;
}

function playSilentUnlockPing(context) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  gain.gain.setValueAtTime(0.00001, context.currentTime);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + 0.02);
}

function playTone(context) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(784, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(622, context.currentTime + 0.14);

  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + 0.22);
}

function isSoundPlaybackAllowed() {
  if (typeof document === "undefined") return false;

  return document.visibilityState === "visible" && !document.hidden;
}

export function unlockNotificationSound() {
  if (typeof window === "undefined") return false;

  try {
    const context = getAudioContext();
    if (!context) return false;

    playSilentUnlockPing(context);

    if (context.state === "running") {
      soundUnlocked = true;
      return true;
    }

    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => {
          soundUnlocked = context.state === "running";
        })
        .catch(() => {});
      return false;
    }

    soundUnlocked = context.state === "running";
    return soundUnlocked;
  } catch {
    return false;
  }
}

export function setupNotificationSoundUnlock() {
  if (typeof window === "undefined" || gestureUnlockAttached) return;

  gestureUnlockAttached = true;

  const unlock = () => {
    unlockNotificationSound();
  };

  document.addEventListener("click", unlock, { once: true, capture: true, passive: true });
  document.addEventListener("pointerdown", unlock, { once: true, capture: true, passive: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });
}

export function playNotificationSound() {
  if (typeof window === "undefined") return;

  if (!isNotificationSoundEnabled()) {
    logSoundEvent("notification:sound:disabled");
    return;
  }

  if (!isSoundPlaybackAllowed()) {
    logSoundEvent("notification:sound:blocked", { reason: "tab-hidden" });
    return;
  }

  if (!soundUnlocked) {
    logSoundEvent("notification:sound:blocked", { reason: "awaiting-user-gesture" });
    return;
  }

  try {
    const context = getAudioContext();

    if (!context) {
      logSoundEvent("notification:sound:blocked", { reason: "no-audio-context" });
      return;
    }

    const runTone = () => {
      if (context.state !== "running") {
        logSoundEvent("notification:sound:blocked", { reason: "context-not-running" });
        return;
      }

      playTone(context);
      logSoundEvent("notification:sound:played");
    };

    if (context.state === "suspended") {
      void context
        .resume()
        .then(runTone)
        .catch(() => {
          logSoundEvent("notification:sound:blocked", { reason: "resume-failed" });
        });
      return;
    }

    runTone();
  } catch {
    logSoundEvent("notification:sound:blocked", { reason: "play-error" });
  }
}

export function installNotificationSoundTestHook() {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.testNotificationSound = () => {
    playNotificationSound();
  };

  return () => {
    delete window.testNotificationSound;
  };
}
