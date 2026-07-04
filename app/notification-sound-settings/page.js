"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  playNotificationSound,
  setupBrowserSoundUnlock,
  unlockNotificationSound,
} from "../../lib/notification-sound-manager";
import { getNotificationSoundKeyDefinitions } from "../../lib/notification-sound-keys";
import {
  loadServerNotificationSoundSettings,
  readCurrentNotificationSoundSettings,
  updateNotificationSoundSettings,
} from "../../lib/notification-sound-settings-client";
import {
  DEFAULT_NOTIFICATION_SOUND_SETTINGS,
  getNotificationKeyPreference,
} from "../../lib/notification-sound-settings-shared";
import { useAuth } from "../components/AuthProvider";

function ToggleRow({ label, description, checked, onChange, disabled = false }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4">
      <span>
        <span className="block text-sm font-black text-white">{label}</span>
        {description ? (
          <span className="mt-1 block text-xs font-bold text-slate-400">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 accent-cyan-400"
      />
    </label>
  );
}

function NotificationKeyRow({
  notificationKey,
  label,
  settings,
  saving,
  onPersistKeyPatch,
  onTest,
}) {
  const preference = getNotificationKeyPreference(settings, notificationKey);
  const volumePercent = Math.round(Number(preference.volume || 0.9) * 100);
  const masterEnabled = settings.sound_enabled;

  return (
    <div className="space-y-3 rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{label}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{notificationKey}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-black text-slate-300">
          <span>تشغيل</span>
          <input
            type="checkbox"
            checked={preference.enabled !== false}
            disabled={saving || !masterEnabled}
            onChange={(event) =>
              onPersistKeyPatch(notificationKey, { enabled: event.target.checked })
            }
            className="h-5 w-5 accent-cyan-400"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[180px] flex-1">
          <p className="text-xs font-bold text-slate-400">مستوى الصوت: {volumePercent}%</p>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={volumePercent}
            disabled={saving || !masterEnabled || preference.enabled === false}
            onChange={(event) => {
              const nextVolume = Number(event.target.value) / 100;
              onPersistKeyPatch(notificationKey, { volume: nextVolume }, { localOnly: true });
            }}
            onMouseUp={(event) =>
              onPersistKeyPatch(notificationKey, {
                volume: Number(event.currentTarget.value) / 100,
              })
            }
            onTouchEnd={(event) =>
              onPersistKeyPatch(notificationKey, {
                volume: Number(event.currentTarget.value) / 100,
              })
            }
            className="mt-2 w-full accent-cyan-400"
          />
        </div>
        <button
          type="button"
          disabled={saving || !masterEnabled}
          onClick={() => onTest(notificationKey)}
          className="notificationsPage__action rounded-2xl border px-4 py-2 text-xs font-black transition disabled:opacity-50"
        >
          اختبار
        </button>
      </div>
    </div>
  );
}

export default function NotificationSoundSettingsPage() {
  const { user, authResolved } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SOUND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAuthenticated = Boolean(user?.id);
  const notificationKeyDefinitions = useMemo(() => getNotificationSoundKeyDefinitions(), []);

  const refreshSettings = useCallback(() => {
    setSettings(readCurrentNotificationSoundSettings());
  }, []);

  useEffect(() => {
    setupBrowserSoundUnlock();
  }, []);

  useEffect(() => {
    if (!authResolved) return;

    setLoading(true);
    setError("");

    if (isAuthenticated) {
      void loadServerNotificationSoundSettings()
        .then((nextSettings) => {
          setSettings(nextSettings);
        })
        .catch((loadError) => {
          setError(loadError?.message || "تعذر تحميل الإعدادات.");
          refreshSettings();
        })
        .finally(() => setLoading(false));
      return;
    }

    refreshSettings();
    setLoading(false);
  }, [authResolved, isAuthenticated, refreshSettings]);

  const persistPatch = useCallback(
    async (patch) => {
      setSaving(true);
      setError("");
      setMessage("");

      try {
        const nextSettings = await updateNotificationSoundSettings(patch, {
          isAuthenticated,
        });
        setSettings(nextSettings);
        setMessage("تم حفظ الإعدادات.");
      } catch (saveError) {
        setError(saveError?.message || "تعذر حفظ الإعدادات.");
        refreshSettings();
      } finally {
        setSaving(false);
      }
    },
    [isAuthenticated, refreshSettings]
  );

  const persistKeyPatch = useCallback(
    async (notificationKey, keyPatch, { localOnly = false } = {}) => {
      const nextPreferences = {
        ...(settings.sound_preferences || {}),
        [notificationKey]: {
          ...(settings.sound_preferences?.[notificationKey] || {}),
          ...keyPatch,
        },
      };

      if (localOnly) {
        setSettings((current) => ({
          ...current,
          sound_preferences: nextPreferences,
        }));
        return;
      }

      await persistPatch({
        sound_preferences: {
          [notificationKey]: keyPatch,
        },
      });
    },
    [persistPatch, settings.sound_preferences]
  );

  const handleTestSound = useCallback(async (notificationKey) => {
    setMessage("");
    setError("");

    const unlocked = await unlockNotificationSound();
    if (!unlocked) {
      setError("اضغط على الصفحة مرة واحدة ثم أعد اختبار الصوت.");
      return;
    }

    playNotificationSound(notificationKey, {
      id: `settings-test-${notificationKey}-${Date.now()}`,
      source: "notification-sound-settings",
      skipSettingsGate: true,
    });

    setMessage(`تم تشغيل صوت الاختبار: ${notificationKey}`);
  }, []);

  const volumePercent = useMemo(
    () => Math.round(Number(settings.sound_volume || 0.9) * 100),
    [settings.sound_volume]
  );

  if (!authResolved) {
    return (
      <main className="notificationsPage relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border p-6">
        <div className="relative z-10 mx-auto max-w-3xl text-center text-sm font-bold text-slate-300">
          جاري التحقق من الجلسة...
        </div>
      </main>
    );
  }

  return (
    <main className="notificationsPage relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border p-6 shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="notificationsPage__glow pointer-events-none absolute inset-0" />

      <div className="relative z-10 mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="notificationsPage__title text-3xl font-black">إعدادات صوت الإشعارات</h1>
            <p className="notificationsPage__subtitle mt-2 text-sm font-bold">
              {isAuthenticated
                ? "يتم حفظ إعداداتك في حسابك على Supabase."
                : "أنت غير مسجل — الإعدادات تُحفظ مؤقتاً في المتصفح فقط."}
            </p>
          </div>
          <Link
            href="/notifications"
            className="notificationsPage__action rounded-2xl border px-4 py-3 text-sm font-black transition"
          >
            العودة للإشعارات
          </Link>
        </div>

        {loading ? (
          <div className="notificationsPage__panel rounded-[28px] border p-8 text-center backdrop-blur-2xl">
            جاري تحميل الإعدادات...
          </div>
        ) : (
          <div className="space-y-4">
            <ToggleRow
              label="تشغيل صوت الإشعارات"
              description="إيقاف هذا الخيار يوقف كل الأصوات."
              checked={settings.sound_enabled}
              disabled={saving}
              onChange={(checked) => void persistPatch({ sound_enabled: checked })}
            />

            <div className="rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">مستوى الصوت الافتراضي</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">{volumePercent}%</p>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={volumePercent}
                disabled={saving || !settings.sound_enabled}
                onChange={(event) => {
                  const nextVolume = Number(event.target.value) / 100;
                  setSettings((current) => ({ ...current, sound_volume: nextVolume }));
                }}
                onMouseUp={(event) =>
                  void persistPatch({ sound_volume: Number(event.currentTarget.value) / 100 })
                }
                onTouchEnd={(event) =>
                  void persistPatch({ sound_volume: Number(event.currentTarget.value) / 100 })
                }
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="space-y-3">
              <h2 className="text-lg font-black text-white">أنواع الإشعارات</h2>
              {notificationKeyDefinitions.map(({ key, label }) => (
                <NotificationKeyRow
                  key={key}
                  notificationKey={key}
                  label={label}
                  settings={settings}
                  saving={saving}
                  onPersistKeyPatch={persistKeyPatch}
                  onTest={handleTestSound}
                />
              ))}
            </div>
          </div>
        )}

        {message ? (
          <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
