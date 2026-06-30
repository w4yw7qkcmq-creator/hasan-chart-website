const STORAGE_KEY = "hc_notification_sound_enabled";

let audioContext = null;
let gestureUnlockAttached = false;

function logSoundEvent(event) {
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

function playTone(context) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(784, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(622, context.currentTime + 0.14);

  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + 0.22);
}

export function unlockNotificationSound() {
  if (typeof window === "undefined") return;

  try {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume().catch(() => {});
    }
  } catch {
    // Ignore unlock failures.
  }
}

export function setupNotificationSoundUnlock() {
  if (typeof window === "undefined" || gestureUnlockAttached) return;

  gestureUnlockAttached = true;

  const unlock = () => {
    unlockNotificationSound();
  };

  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playNotificationSound() {
  if (typeof window === "undefined") return;

  if (!isNotificationSoundEnabled()) {
    logSoundEvent("notification:sound:disabled");
    return;
  }

  try {
    const context = getAudioContext();

    if (!context) {
      logSoundEvent("notification:sound:blocked");
      return;
    }

    const runTone = () => {
      if (context.state !== "running") {
        logSoundEvent("notification:sound:blocked");
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
          logSoundEvent("notification:sound:blocked");
        });
      return;
    }

    runTone();
  } catch {
    logSoundEvent("notification:sound:blocked");
  }
}
