const STORAGE_KEY = "hc_notification_sound_enabled";

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

let audioContext = null;

export function playNotificationSound() {
  if (typeof window === "undefined") return;
  if (!isNotificationSoundEnabled()) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {});
    }

    const context = audioContext;
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
  } catch {
    // Never break the app if audio fails or is blocked.
  }
}
