"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  playNotificationSound,
  setupBrowserSoundUnlock,
  unlockNotificationSound,
} from "../../../lib/notification-sound-manager";
import {
  loadNotificationSettings,
  resetNotificationSettings,
  saveNotificationSettings,
} from "../../../lib/notification-settings-client";
import { applyServerNotificationSettings } from "../../../lib/notification-settings-store";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getChannelPreference,
  getDefaultGlobalSoundTone,
  NOTIFICATION_SOUND_TONE_OPTIONS,
  PHASE1_NOTIFICATION_CHANNELS,
} from "../../../lib/notification-settings-shared";
import { getNotificationKeyPreference } from "../../../lib/notification-sound-settings-shared";
import { useAuth } from "../../components/AuthProvider";

function SectionCard({ title, description, children, badge = null }) {
  return (
    <section className="notificationsPage__panel space-y-4 rounded-[28px] border p-5 backdrop-blur-2xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs font-bold text-slate-400">{description}</p>
          ) : null}
        </div>
        {badge ? (
          <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-black text-cyan-100">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  compact = false,
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-2xl border border-cyan-300/15 bg-white/[0.04] ${
        compact ? "p-3" : "p-4"
      } ${disabled ? "opacity-60" : ""}`}
    >
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
        className="mt-1 h-5 w-5 shrink-0 accent-cyan-400"
      />
    </label>
  );
}

function ChannelSettingsCard({
  channel,
  settings,
  saving,
  masterEnabled,
  globalEmailEnabled,
  globalSoundEnabled,
  onUpdateChannel,
  onUpdateSound,
  onTestSound,
}) {
  const channelPref = getChannelPreference(settings, channel.key);
  const soundPref = getNotificationKeyPreference(settings, channel.key);
  const channelDisabled = saving || !masterEnabled;
  const emailToggleDisabled = channelDisabled || !globalEmailEnabled;

  return (
    <article className="rounded-[24px] border border-cyan-300/12 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl">
          {channel.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-white">{channel.label}</h3>
          <p className="mt-1 text-xs font-bold leading-relaxed text-slate-400">
            {channel.description}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {channel.key}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ToggleRow
          compact
          label="داخل الموقع"
          description="إشعار في مركز الإشعارات"
          checked={channelPref.enabled}
          disabled={channelDisabled}
          onChange={(checked) => onUpdateChannel(channel.key, { enabled: checked })}
        />
        <ToggleRow
          compact
          label="Web Push"
          description="إشعار المتصفح / الجوال"
          checked={channelPref.push_enabled}
          disabled={channelDisabled}
          onChange={(checked) => onUpdateChannel(channel.key, { push_enabled: checked })}
        />
        <ToggleRow
          compact
          label="الصوت"
          description="تشغيل نغمة التنبيه"
          checked={soundPref.enabled !== false}
          disabled={channelDisabled || !globalSoundEnabled}
          onChange={(checked) => onUpdateSound(channel.key, { enabled: checked })}
        />
        <ToggleRow
          compact
          label="البريد الإلكتروني"
          description="نسخة إلى بريدك المسجل"
          checked={channelPref.email_enabled}
          disabled={emailToggleDisabled}
          onChange={(checked) => onUpdateChannel(channel.key, { email_enabled: checked })}
        />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={channelDisabled || !globalSoundEnabled || soundPref.enabled === false}
          onClick={() => onTestSound(channel.key)}
          className="notificationsPage__action rounded-xl border px-3 py-2 text-xs font-black transition disabled:opacity-50"
        >
          🔊 اختبار الصوت
        </button>
      </div>
    </article>
  );
}

export default function NotificationSettingsPage() {
  const { user, authResolved } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAuthenticated = Boolean(user?.id);
  const masterEnabled = settings.notifications_enabled !== false;
  const globalSoundEnabled = settings.sound_enabled !== false;
  const globalEmailEnabled = settings.email_copy_enabled === true;

  const selectedTone = useMemo(
    () => getDefaultGlobalSoundTone(settings),
    [settings]
  );

  const volumePercent = Math.round(Number(settings.sound_volume || 0.9) * 100);

  const enabledChannelsCount = useMemo(() => {
    return PHASE1_NOTIFICATION_CHANNELS.filter(
      (item) => getChannelPreference(settings, item.key).enabled
    ).length;
  }, [settings]);

  useEffect(() => {
    setupBrowserSoundUnlock();
  }, []);

  useEffect(() => {
    if (!authResolved) return;

    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    void loadNotificationSettings()
      .then((result) => {
        if (process.env.NODE_ENV !== "production") {
          console.log("NOTIFICATION_SETTINGS_LOAD_SUCCESS", {
            channel_preferences: result.settings.channel_preferences,
          });
        }
        setSettings(result.settings);
        applyServerNotificationSettings(result.settings);
      })
      .catch((loadError) => {
        setError(loadError?.message || "تعذر تحميل الإعدادات.");
      })
      .finally(() => setLoading(false));
  }, [authResolved, isAuthenticated]);

  const updateSettings = useCallback((patch) => {
    setSettings((current) => ({
      ...current,
      ...patch,
    }));
  }, []);

  const updateChannelPreference = useCallback((key, patch) => {
    setSettings((current) => ({
      ...current,
      channel_preferences: {
        ...(current.channel_preferences || {}),
        [key]: {
          ...(current.channel_preferences?.[key] || {}),
          ...patch,
        },
      },
    }));
  }, []);

  const updateSoundPreference = useCallback((key, patch) => {
    setSettings((current) => ({
      ...current,
      sound_preferences: {
        ...(current.sound_preferences || {}),
        [key]: {
          ...(current.sound_preferences?.[key] || {}),
          ...patch,
        },
      },
    }));
  }, []);

  const applyToneToAllKeys = useCallback((toneId) => {
    setSettings((current) => {
      const nextPreferences = { ...(current.sound_preferences || {}) };

      for (const { key } of PHASE1_NOTIFICATION_CHANNELS) {
        nextPreferences[key] = {
          ...(nextPreferences[key] || {}),
          sound: toneId,
        };
      }

      return {
        ...current,
        sound_preferences: nextPreferences,
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!isAuthenticated) {
      setError("يجب تسجيل الدخول لإدارة إعدادات الإشعارات.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("NOTIFICATION_SETTINGS_SAVE_START");
      }
      const result = await saveNotificationSettings(settings);
      setSettings(result.settings);
      setMessage("تم حفظ إعدادات الإشعارات بنجاح");
    } catch (saveError) {
      setError(saveError?.message || "تعذر حفظ الإعدادات.");
    } finally {
      setSaving(false);
    }
  }, [isAuthenticated, settings]);

  const handleReset = useCallback(async () => {
    if (!isAuthenticated) {
      setError("يجب تسجيل الدخول لإدارة إعدادات الإشعارات.");
      return;
    }

    const confirmed = window.confirm(
      "هل تريد إعادة جميع إعدادات الإشعارات إلى القيم الافتراضية؟"
    );

    if (!confirmed) return;

    setResetting(true);
    setError("");
    setMessage("");

    try {
      const result = await resetNotificationSettings();
      setSettings(result.settings);
      setMessage("تمت إعادة الإعدادات الافتراضية بنجاح.");
    } catch (resetError) {
      setError(resetError?.message || "تعذر إعادة الإعدادات.");
    } finally {
      setResetting(false);
    }
  }, [isAuthenticated]);

  const handleTestSound = useCallback(async (notificationKey) => {
    setMessage("");
    setError("");

    const unlocked = await unlockNotificationSound();
    if (!unlocked) {
      setError("اضغط على الصفحة مرة واحدة ثم أعد اختبار الصوت.");
      return;
    }

    await playNotificationSound(notificationKey, {
      id: `settings-test-${notificationKey}-${Date.now()}`,
      source: "notification-settings",
      skipSettingsGate: true,
    });

    setMessage(`تم تشغيل صوت الاختبار: ${notificationKey}`);
  }, []);

  if (!authResolved) {
    return (
      <main className="notificationsPage relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border p-6">
        <div className="relative z-10 mx-auto max-w-4xl text-center text-sm font-bold text-slate-300">
          جاري التحقق من الجلسة...
        </div>
      </main>
    );
  }

  return (
    <main className="notificationsPage relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border p-4 shadow-[0_25px_90px_rgba(0,102,255,0.16)] sm:p-6">
      <div className="notificationsPage__glow pointer-events-none absolute inset-0" />

      <div className="relative z-10 mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300/70">
              HasaN CharT World
            </p>
            <h1 className="notificationsPage__title mt-1 text-2xl font-black sm:text-3xl">
              إعدادات الإشعارات
            </h1>
            <p className="notificationsPage__subtitle mt-2 max-w-2xl text-sm font-bold">
              تحكم كامل في الإشعارات داخل الموقع، Web Push، الصوت، والبريد — لكل نوع على حدة.
            </p>
          </div>
          <Link
            href="/notifications"
            className="notificationsPage__action rounded-2xl border px-4 py-3 text-sm font-black transition"
          >
            ← العودة للإشعارات
          </Link>
        </div>

        {loading ? (
          <div className="notificationsPage__panel space-y-6 rounded-[28px] border p-6 backdrop-blur-2xl sm:p-8">
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" />
              <p className="text-sm font-bold text-slate-300">جاري تحميل إعداداتك...</p>
            </div>
            <div className="space-y-4" aria-hidden="true">
              {[1, 2, 3].map((section) => (
                <div key={section} className="rounded-2xl border border-cyan-300/10 bg-white/[0.03] p-5">
                  <div className="mb-4 h-5 w-40 animate-pulse rounded bg-white/10" />
                  <div className="space-y-3">
                    <div className="h-14 animate-pulse rounded-xl bg-white/[0.06]" />
                    <div className="h-14 animate-pulse rounded-xl bg-white/[0.06]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !isAuthenticated ? (
          <div className="notificationsPage__panel rounded-[28px] border p-10 text-center backdrop-blur-2xl">
            <p className="text-lg font-black text-white">يجب تسجيل الدخول</p>
            <p className="mt-2 text-sm font-bold text-slate-300">
              يجب تسجيل الدخول لإدارة إعدادات الإشعارات.
            </p>
            <Link
              href="/login"
              className="notificationsPage__action mt-6 inline-block rounded-2xl border px-5 py-3 text-sm font-black"
            >
              تسجيل الدخول
            </Link>
          </div>
        ) : (
          <>
            <SectionCard
              title="الإعدادات العامة"
              description="تطبق على جميع أنواع الإشعارات ما لم تُخصّص لكل نوع."
              badge={masterEnabled ? "مفعّل" : "متوقف"}
            >
              <div className="space-y-3">
                <ToggleRow
                  label="تفعيل كل الإشعارات"
                  description="إيقاف هذا الخيار يوقف كل الإشعارات (داخل الموقع، Push، البريد، الصوت)."
                  checked={masterEnabled}
                  disabled={saving || resetting}
                  onChange={(checked) => updateSettings({ notifications_enabled: checked })}
                />

                <ToggleRow
                  label="إرسال نسخة إلى البريد الإلكتروني"
                  description="يجب تفعيله أولاً لتفعيل البريد لأي نوع إشعار يدعمه."
                  checked={globalEmailEnabled}
                  disabled={saving || resetting || !masterEnabled}
                  onChange={(checked) => updateSettings({ email_copy_enabled: checked })}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="الصوت"
              description="مستوى الصوت والنغمة الافتراضية لجميع أنواع الإشعارات."
            >
              <div className="space-y-3">
                <ToggleRow
                  label="تشغيل الصوت"
                  description="إيقاف هذا الخيار يوقف كل أصوات الإشعارات."
                  checked={globalSoundEnabled}
                  disabled={saving || resetting || !masterEnabled}
                  onChange={(checked) => updateSettings({ sound_enabled: checked })}
                />

                <div className="rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-white">مستوى الصوت</p>
                    <span className="rounded-lg bg-cyan-400/10 px-2 py-1 text-xs font-black text-cyan-100">
                      {volumePercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={volumePercent}
                    disabled={saving || resetting || !globalSoundEnabled || !masterEnabled}
                    onChange={(event) =>
                      updateSettings({ sound_volume: Number(event.target.value) / 100 })
                    }
                    className="mt-3 w-full accent-cyan-400"
                  />
                </div>

                <div className="rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4">
                  <label className="block text-sm font-black text-white" htmlFor="notification-tone">
                    نغمة التنبيه
                  </label>
                  <select
                    id="notification-tone"
                    value={selectedTone}
                    disabled={saving || resetting || !globalSoundEnabled || !masterEnabled}
                    onChange={(event) => applyToneToAllKeys(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-cyan-300/20 bg-slate-950/70 px-3 py-2.5 text-sm font-bold text-white"
                  >
                    {NOTIFICATION_SOUND_TONE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="عدم الإزعاج (DND)"
              description="خلال هذه الفترة لن تصلك إشعارات حتى لو كانت مفعّلة."
              badge={settings.dnd_enabled ? "نشط" : "غير نشط"}
            >
              <div className="space-y-3">
                <ToggleRow
                  label="تفعيل وضع عدم الإزعاج"
                  description="يُطبَّق فوراً على جميع قنوات الإشعارات."
                  checked={settings.dnd_enabled === true}
                  disabled={saving || resetting || !masterEnabled}
                  onChange={(checked) => updateSettings({ dnd_enabled: checked })}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4">
                    <span className="block text-sm font-black text-white">وقت البداية</span>
                    <input
                      type="time"
                      value={settings.dnd_start_time || "22:00"}
                      disabled={saving || resetting || !settings.dnd_enabled || !masterEnabled}
                      onChange={(event) => updateSettings({ dnd_start_time: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-cyan-300/20 bg-slate-950/70 px-3 py-2 text-sm font-bold text-white"
                    />
                  </label>

                  <label className="rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4">
                    <span className="block text-sm font-black text-white">وقت النهاية</span>
                    <input
                      type="time"
                      value={settings.dnd_end_time || "07:00"}
                      disabled={saving || resetting || !settings.dnd_enabled || !masterEnabled}
                      onChange={(event) => updateSettings({ dnd_end_time: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-cyan-300/20 bg-slate-950/70 px-3 py-2 text-sm font-bold text-white"
                    />
                  </label>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="إعدادات كل نوع إشعار"
              description="خصّص القنوات لكل نوع: داخل الموقع، Web Push، الصوت، والبريد."
              badge={`${enabledChannelsCount}/${PHASE1_NOTIFICATION_CHANNELS.length} مفعّل`}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                {PHASE1_NOTIFICATION_CHANNELS.map((channel) => (
                  <ChannelSettingsCard
                    key={channel.key}
                    channel={channel}
                    settings={settings}
                    saving={saving || resetting}
                    masterEnabled={masterEnabled}
                    globalEmailEnabled={globalEmailEnabled}
                    globalSoundEnabled={globalSoundEnabled}
                    onUpdateChannel={updateChannelPreference}
                    onUpdateSound={updateSoundPreference}
                    onTestSound={(key) => void handleTestSound(key)}
                  />
                ))}
              </div>
            </SectionCard>

            <div className="sticky bottom-4 z-20 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={saving || resetting}
                  onClick={() => void handleSave()}
                  className="notificationsPage__action flex-1 rounded-2xl border px-4 py-3.5 text-sm font-black transition disabled:opacity-50"
                >
                  {saving ? "جاري الحفظ..." : "💾 حفظ الإعدادات"}
                </button>
                <button
                  type="button"
                  disabled={saving || resetting}
                  onClick={() => void handleReset()}
                  className="notificationsPage__danger flex-1 rounded-2xl border px-4 py-3.5 text-sm font-black transition disabled:opacity-50 sm:max-w-[220px]"
                >
                  {resetting ? "جاري الإعادة..." : "↺ إعادة الافتراضي"}
                </button>
              </div>

              {message ? (
                <p
                  role="status"
                  className="notificationsPage__alertSuccess rounded-2xl px-4 py-3.5 text-sm font-black leading-relaxed"
                >
                  {message}
                </p>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="notificationsPage__alertError rounded-2xl px-4 py-3.5 text-sm font-black leading-relaxed"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </>
        )}

      </div>
    </main>
  );
}
