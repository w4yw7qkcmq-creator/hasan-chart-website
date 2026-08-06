"use client";
import { UiPageShell } from "../../../../components/ui";
import "../../admin-theme.css";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../../../../lib/admin-fetch";
const DEFAULT_SETTINGS = {
  enableAutoUpgrade: true,
  enableAutoRelease: true,
  enableMonthlyBonus: true,
  enableAchievements: true,
  monthlyBonusValues: { silver: 100, gold: 300, platinum: 800, diamond: 2000 },
  minimumSalesForBonus: 0,
  minimumReferralsForBonus: 0,
};
function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border admin-panel-border admin-panel px-4 py-3">
      {" "}
      <span className="font-bold">{label}</span>{" "}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />{" "}
    </label>
  );
}
export default function PartnerAutomationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningBonus, setRunningBonus] = useState(false);
  const [runningUpgrade, setRunningUpgrade] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/partner-settings", {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل الإعدادات");
      }
      setSettings(result.settings || DEFAULT_SETTINGS);
    } catch (loadError) {
      setError(loadError?.message || "تعذر تحميل الإعدادات");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);
  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await adminFetch("/api/admin/partner-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر حفظ الإعدادات");
      }
      setSettings(result.settings || settings);
      setMessage(result.message || "تم الحفظ");
    } catch (saveError) {
      setError(saveError?.message || "تعذر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };
  const runBonus = async () => {
    setRunningBonus(true);
    setMessage("");
    setError("");
    try {
      const response = await adminFetch("/api/admin/run-partner-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تشغيل المكافآت");
      }
      setMessage(result.message || "تم تشغيل المكافآت الشهرية");
    } catch (runError) {
      setError(runError?.message || "تعذر تشغيل المكافآت");
    } finally {
      setRunningBonus(false);
    }
  };
  const runUpgrade = async () => {
    setRunningUpgrade(true);
    setMessage("");
    setError("");
    try {
      const response = await adminFetch("/api/admin/run-partner-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تشغيل الترقية");
      }
      setMessage(result.message || "تم تشغيل الترقية التلقائية");
    } catch (runError) {
      setError(runError?.message || "تعذر تشغيل الترقية");
    } finally {
      setRunningUpgrade(false);
    }
  };
  if (loading) {
    return (
      <main className="rounded-[34px] border admin-panel-border ui-page-dark p-6 admin-text">
        {" "}
        <p>جاري تحميل إعدادات الأتمتة...</p>{" "}
      </main>
    );
  }
  return (
    <main className="admin-theme-page space-y-6 rounded-[34px] border admin-panel-border ui-page-dark p-4 admin-text md:p-6">
      {" "}
      <header className="flex flex-wrap items-center justify-between gap-4">
        {" "}
        <div>
          {" "}
          <p className="text-sm font-bold admin-text-muted/70">
            Partner Automation
          </p>{" "}
          <h1 className="mt-2 text-3xl font-black">
            إعدادات الأتمتة والمكافآت
          </h1>{" "}
        </div>{" "}
        <Link
          href="/admin/partners"
          className="rounded-2xl border admin-panel-border px-4 py-2 text-sm font-black ui-public-seo-link-chip"
        >
          {" "}
          ← العودة{" "}
        </Link>{" "}
      </header>{" "}
      {error ? (
        <div className="admin-banner-danger text-sm">
          {error}
        </div>
      ) : null}{" "}
      {message ? (
        <div className="admin-banner-success text-sm">
          {message}
        </div>
      ) : null}{" "}
      <form onSubmit={saveSettings} className="space-y-6">
        {" "}
        <section className="rounded-[28px] border admin-panel-border ui-glass-045 p-5">
          {" "}
          <h2 className="text-xl font-black">Partner Automation</h2>{" "}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {" "}
            <Toggle
              label="Enable Auto Upgrade"
              checked={settings.enableAutoUpgrade}
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, enableAutoUpgrade: value }))
              }
            />{" "}
            <Toggle
              label="Enable Auto Release"
              checked={settings.enableAutoRelease}
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, enableAutoRelease: value }))
              }
            />{" "}
            <Toggle
              label="Enable Monthly Bonus"
              checked={settings.enableMonthlyBonus}
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, enableMonthlyBonus: value }))
              }
            />{" "}
            <Toggle
              label="Enable Achievements"
              checked={settings.enableAchievements}
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, enableAchievements: value }))
              }
            />{" "}
          </div>{" "}
        </section>{" "}
        <section className="rounded-[28px] border admin-panel-border ui-glass-045 p-5">
          {" "}
          <h2 className="text-xl font-black">Bonus Values (USDT)</h2>{" "}
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {" "}
            {["silver", "gold", "platinum", "diamond"].map((tier) => (
              <label key={tier} className="block">
                {" "}
                <span className="mb-2 block text-sm capitalize admin-text-muted">
                  {tier}
                </span>{" "}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={settings.monthlyBonusValues?.[tier] ?? 0}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      monthlyBonusValues: {
                        ...prev.monthlyBonusValues,
                        [tier]: Number(event.target.value),
                      },
                    }))
                  }
                  className="w-full rounded-xl border admin-panel-border admin-panel px-4 py-3"
                />{" "}
              </label>
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="rounded-[28px] border admin-panel-border ui-glass-045 p-5">
          {" "}
          <h2 className="text-xl font-black">Minimum Requirements</h2>{" "}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {" "}
            <label className="block">
              {" "}
              <span className="mb-2 block text-sm admin-text-muted">
                Minimum Sales
              </span>{" "}
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.minimumSalesForBonus}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    minimumSalesForBonus: Number(event.target.value),
                  }))
                }
                className="w-full rounded-xl border admin-panel-border admin-panel px-4 py-3"
              />{" "}
            </label>{" "}
            <label className="block">
              {" "}
              <span className="mb-2 block text-sm admin-text-muted">
                Minimum Referrals
              </span>{" "}
              <input
                type="number"
                min="0"
                step="1"
                value={settings.minimumReferralsForBonus}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    minimumReferralsForBonus: Number(event.target.value),
                  }))
                }
                className="w-full rounded-xl border admin-panel-border admin-panel px-4 py-3"
              />{" "}
            </label>{" "}
          </div>{" "}
        </section>{" "}
        <div className="flex flex-wrap gap-3">
          {" "}
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl admin-panel px-6 py-3 font-black ui-text-strong disabled:opacity-60"
          >
            {" "}
            {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}{" "}
          </button>{" "}
          <button
            type="button"
            disabled={runningBonus}
            onClick={() => void runBonus()}
            className="rounded-2xl border admin-panel-border px-6 py-3 font-black disabled:opacity-60"
          >
            {" "}
            {runningBonus ? "..." : "Run Monthly Bonus"}{" "}
          </button>{" "}
          <button
            type="button"
            disabled={runningUpgrade}
            onClick={() => void runUpgrade()}
            className="rounded-2xl border admin-panel-border px-6 py-3 font-black disabled:opacity-60"
          >
            {" "}
            {runningUpgrade ? "..." : "Run Auto Upgrade"}{" "}
          </button>{" "}
        </div>{" "}
      </form>{" "}
    </main>
  );
}
