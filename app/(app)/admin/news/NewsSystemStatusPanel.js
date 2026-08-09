"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";

const STATE_LABELS = {
  HEALTHY: "سليم",
  DEGRADED: "متدهور",
  QUARANTINED: "معزول",
  RECOVERING: "يتعافى",
};

function formatTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ar-SA", { hour12: false });
  } catch {
    return value;
  }
}

function HealthBadge({ value }) {
  const normalized = String(value || "unknown").toUpperCase();
  const className =
    normalized === "HEALTHY"
      ? "admin-news-system__badge admin-news-system__badge--ok"
      : normalized === "CRITICAL"
        ? "admin-news-system__badge admin-news-system__badge--critical"
        : "admin-news-system__badge admin-news-system__badge--warn";
  return <span className={className}>{STATE_LABELS[normalized] || normalized}</span>;
}

export default function NewsSystemStatusPanel() {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statusRes, summaryRes] = await Promise.all([
        adminFetch("/api/admin/news/system-status"),
        adminFetch("/api/admin/news/system-status?view=summary"),
      ]);
      const statusJson = await statusRes.json().catch(() => ({}));
      const summaryJson = await summaryRes.json().catch(() => ({}));
      if (!statusRes.ok || !statusJson?.success) {
        throw new Error(statusJson?.error || "بيانات المراقبة غير متاحة مؤقتًا");
      }
      setStatus(statusJson.status || statusJson);
      setSummary(summaryJson.summary || null);
    } catch (loadError) {
      setError(loadError?.message || "بيانات المراقبة غير متاحة مؤقتًا");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="admin-news-page__card admin-news-system" aria-labelledby="news-system-status-title">
        <h2 id="news-system-status-title" className="admin-news-page__card-title">
          حالة نظام الأخبار
        </h2>
        <p className="admin-news-page__hint">جاري تحميل حالة النظام...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-news-page__card admin-news-system" aria-labelledby="news-system-status-title">
        <h2 id="news-system-status-title" className="admin-news-page__card-title">
          حالة نظام الأخبار
        </h2>
        <div className="admin-news-page__alert admin-news-page__alert--error" role="alert">
          {error}
        </div>
        <button type="button" className="admin-news-page__submit" onClick={load}>
          إعادة المحاولة
        </button>
      </section>
    );
  }

  const runtime = status?.runtime?.phase3 || status?.runtime || {};
  const phase2 = status?.runtime?.phase2 || {};
  const sources = status?.sources?.details || [];
  const incidents = status?.openIncidents || [];
  const last24h = status?.last24h || summary || {};

  return (
    <section className="admin-news-page__card admin-news-system" aria-labelledby="news-system-status-title">
      <div className="admin-news-system__header">
        <h2 id="news-system-status-title" className="admin-news-page__card-title">
          حالة نظام الأخبار
        </h2>
        <button type="button" className="admin-news-page__submit admin-news-system__refresh" onClick={load}>
          تحديث
        </button>
      </div>

      <div className="admin-news-system__grid">
        <div className="admin-news-system__stat">
          <span className="admin-news-system__label">الصحة العامة</span>
          <HealthBadge value={status?.overallHealth} />
        </div>
        <div className="admin-news-system__stat">
          <span className="admin-news-system__label">Phase 2 Editorial</span>
          <strong>{phase2.phase2Editorial ? "مفعّل" : "متوقف"}</strong>
        </div>
        <div className="admin-news-system__stat">
          <span className="admin-news-system__label">Phase 3 Autonomy</span>
          <strong>{runtime.phase3Autonomy ? "مفعّل" : "تشخيص فقط"}</strong>
        </div>
        <div className="admin-news-system__stat">
          <span className="admin-news-system__label">Auto-Quarantine</span>
          <strong>{runtime.phase3AutoQuarantine ? "مفعّل" : "متوقف"}</strong>
        </div>
        <div className="admin-news-system__stat">
          <span className="admin-news-system__label">AI</span>
          <strong>{phase2.phase2Ai ? "مفعّل" : "متوقف"}</strong>
        </div>
        <div className="admin-news-system__stat">
          <span className="admin-news-system__label">آخر دورة</span>
          <strong>{formatTime(status?.lastSuccessfulCycleAt || status?.heartbeat?.lastCycleCompletedAt)}</strong>
        </div>
      </div>

      <h3 className="admin-news-system__subtitle">آخر 24 ساعة</h3>
      <div className="admin-news-system__grid">
        <div className="admin-news-system__stat"><span className="admin-news-system__label">معالج</span><strong>{last24h.processed ?? status?.metrics?.candidates_total ?? 0}</strong></div>
        <div className="admin-news-system__stat"><span className="admin-news-system__label">منشور</span><strong>{last24h.published ?? status?.metrics?.publications_success ?? 0}</strong></div>
        <div className="admin-news-system__stat"><span className="admin-news-system__label">Duplicates</span><strong>{last24h.duplicatesBlocked ?? status?.duplicateBlocksToday ?? 0}</strong></div>
        <div className="admin-news-system__stat"><span className="admin-news-system__label">Quality blocks</span><strong>{last24h.qualityBlocks ?? status?.qualityBlocksToday ?? 0}</strong></div>
        <div className="admin-news-system__stat"><span className="admin-news-system__label">Copy blocks</span><strong>{last24h.copyBlocks ?? status?.copyBlocksToday ?? 0}</strong></div>
        <div className="admin-news-system__stat"><span className="admin-news-system__label">Avg latency</span><strong>{last24h.averageLatencyMs ?? status?.averageIngestToPublishLatencyMs ?? "—"} ms</strong></div>
      </div>

      <h3 className="admin-news-system__subtitle">المصادر</h3>
      {sources.length ? (
        <div className="admin-news-system__table-wrap">
          <table className="admin-news-system__table">
            <thead>
              <tr>
                <th>المصدر</th>
                <th>الحالة</th>
                <th>Parse success</th>
                <th>Failures</th>
                <th>آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={`${source.sourceType}:${source.sourceId}`}>
                  <td>{source.sourceId || "—"}</td>
                  <td><HealthBadge value={source.state} /></td>
                  <td>{source.parseSuccessRate != null ? `${Math.round(source.parseSuccessRate * 100)}%` : "—"}</td>
                  <td>{source.sourceCausedConsecutive ?? 0}</td>
                  <td>{formatTime(source.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-news-page__hint">لا توجد بيانات مصادر بعد. ستظهر بعد أول دورات المراقبة.</p>
      )}

      <h3 className="admin-news-system__subtitle">Incidents مفتوحة ({incidents.length})</h3>
      {incidents.length ? (
        <div className="admin-news-system__table-wrap">
          <table className="admin-news-system__table">
            <thead>
              <tr>
                <th>النوع</th>
                <th>الخطورة</th>
                <th>المصدر</th>
                <th>العدد</th>
                <th>آخر ظهور</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.incidentId}>
                  <td>{incident.type}</td>
                  <td>{incident.severity}</td>
                  <td>{incident.affectedSource || "—"}</td>
                  <td>{incident.count}</td>
                  <td>{formatTime(incident.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-news-page__hint">لا توجد incidents مفتوحة.</p>
      )}
    </section>
  );
}
