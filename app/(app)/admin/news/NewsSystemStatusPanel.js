"use client";

import {
  AI_COPY_POLISH_HINT,
  AI_COPY_POLISH_LABEL,
  filterProductionIncidents,
  filterProductionSources,
  formatGregorianDateTime,
  formatLatencyMs,
  formatRelativeAge,
  healthBadgeClass,
  SEVERITY_LABELS,
  severityBadgeClass,
  STATE_LABELS,
  toggleBadgeClass,
} from "./news-system-display";
import { useNewsSystemStatus } from "./useNewsSystemStatus";

function HealthBadge({ value }) {
  const normalized = String(value || "unknown").toUpperCase();
  return (
    <span className={healthBadgeClass(normalized)} aria-label={`الحالة: ${STATE_LABELS[normalized] || normalized}`}>
      <span className="admin-news-system__badge-dot" aria-hidden="true" />
      {STATE_LABELS[normalized] || normalized}
    </span>
  );
}

function SeverityBadge({ value }) {
  const normalized = String(value || "unknown").toUpperCase();
  return (
    <span className={severityBadgeClass(normalized)} aria-label={`الخطورة: ${SEVERITY_LABELS[normalized] || normalized}`}>
      {SEVERITY_LABELS[normalized] || normalized}
    </span>
  );
}

function ToggleBadge({ enabled, enabledLabel = "مفعّل", disabledLabel = "متوقف" }) {
  return (
    <span className={toggleBadgeClass(enabled)}>
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}

function StatusSkeleton() {
  return (
    <div className="admin-news-system__skeleton" aria-hidden="true">
      <div className="admin-news-system__skeleton-row" />
      <div className="admin-news-system__skeleton-grid">
        <div className="admin-news-system__skeleton-card" />
        <div className="admin-news-system__skeleton-card" />
        <div className="admin-news-system__skeleton-card" />
        <div className="admin-news-system__skeleton-card" />
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="admin-news-system__metric-card">
      <span className="admin-news-system__metric-label">{label}</span>
      <strong className="admin-news-system__metric-value">{value}</strong>
    </div>
  );
}

function CycleTimestamp({ value }) {
  const formatted = formatGregorianDateTime(value);
  if (formatted === "—") return <span className="admin-news-system__cycle-value">—</span>;
  const [dateLine, timeLine] = formatted.split("\n");
  return (
    <span className="admin-news-system__cycle-value">
      <span>{dateLine}</span>
      <span className="admin-news-system__cycle-time">{timeLine}</span>
    </span>
  );
}

export default function NewsSystemStatusPanel() {
  const { status, summary, loading, error, refreshWarning, lastUpdatedAt, nowTick, retry } = useNewsSystemStatus();

  if (loading && !status) {
    return (
      <section className="admin-news-page__card admin-news-system" aria-labelledby="news-system-status-title">
        <div className="admin-news-system__header">
          <div>
            <h2 id="news-system-status-title" className="admin-news-page__card-title">
              حالة نظام الأخبار
            </h2>
            <p className="admin-news-system__meta">جاري تحميل بيانات المراقبة...</p>
          </div>
        </div>
        <StatusSkeleton />
      </section>
    );
  }

  if (error && !status) {
    return (
      <section className="admin-news-page__card admin-news-system" aria-labelledby="news-system-status-title">
        <div className="admin-news-system__header">
          <h2 id="news-system-status-title" className="admin-news-page__card-title">
            حالة نظام الأخبار
          </h2>
        </div>
        <div className="admin-news-page__alert admin-news-page__alert--error" role="alert">
          {error}
        </div>
        <button type="button" className="admin-news-system__retry" onClick={retry}>
          إعادة المحاولة
        </button>
      </section>
    );
  }

  const runtime = status?.runtime?.phase3 || status?.runtime || {};
  const phase2 = status?.runtime?.phase2 || {};
  const sources = filterProductionSources(status?.sources?.details || []);
  const incidents = filterProductionIncidents(status?.openIncidents || []);
  const last24h = status?.last24h || summary || {};
  const cycleAt = status?.lastSuccessfulCycleAt || status?.heartbeat?.lastCycleCompletedAt;

  return (
    <section className="admin-news-page__card admin-news-system" aria-labelledby="news-system-status-title">
      <div className="admin-news-system__header">
        <div>
          <h2 id="news-system-status-title" className="admin-news-page__card-title">
            حالة نظام الأخبار
          </h2>
          <p className="admin-news-system__meta" aria-live="polite">
            {lastUpdatedAt ? (
              <>
                آخر تحديث: {formatRelativeAge(lastUpdatedAt, nowTick)}
                <span className="admin-news-system__meta-sep">·</span>
                <span>تم التحديث تلقائيًا</span>
              </>
            ) : (
              "تم التحديث تلقائيًا"
            )}
          </p>
        </div>
        {refreshWarning ? (
          <p className="admin-news-system__refresh-warning" role="status" aria-live="polite">
            {refreshWarning}
          </p>
        ) : null}
      </div>

      <div className="admin-news-system__overview">
        <div className="admin-news-system__overview-card admin-news-system__overview-card--primary">
          <span className="admin-news-system__label">الصحة العامة</span>
          <HealthBadge value={status?.overallHealth} />
        </div>
        <div className="admin-news-system__overview-card">
          <span className="admin-news-system__label">Phase 2 Editorial</span>
          <ToggleBadge enabled={Boolean(phase2.phase2Editorial)} />
        </div>
        <div className="admin-news-system__overview-card">
          <span className="admin-news-system__label">Phase 3 Autonomy</span>
          <ToggleBadge enabled={Boolean(runtime.phase3Autonomy)} disabledLabel="تشخيص فقط" />
        </div>
        <div className="admin-news-system__overview-card">
          <span className="admin-news-system__label">Auto-Quarantine</span>
          <ToggleBadge enabled={Boolean(runtime.phase3AutoQuarantine)} />
        </div>
        <div className="admin-news-system__overview-card">
          <span className="admin-news-system__label admin-news-system__label--stacked">
            {AI_COPY_POLISH_LABEL}
            <span className="admin-news-system__label-hint">{AI_COPY_POLISH_HINT}</span>
          </span>
          <ToggleBadge enabled={Boolean(phase2.phase2Ai)} disabledLabel="غير مفعّل" />
        </div>
        <div className="admin-news-system__overview-card admin-news-system__overview-card--cycle">
          <span className="admin-news-system__label">آخر دورة</span>
          <CycleTimestamp value={cycleAt} />
        </div>
      </div>

      <h3 className="admin-news-system__subtitle">آخر 24 ساعة</h3>
      <div className="admin-news-system__metric-grid">
        <MetricCard label="مرصود" value={last24h.observed ?? status?.metrics?.candidates_total ?? 0} />
        <MetricCard label="تم تقييمه" value={last24h.evaluated ?? status?.metrics?.editorial_evaluated ?? 0} />
        <MetricCard label="منشور" value={last24h.published ?? status?.metrics?.publications_success ?? 0} />
        <MetricCard label="التكرارات المحظورة" value={last24h.duplicatesBlocked ?? 0} />
        <MetricCard label="حظر الجودة" value={last24h.qualityBlocks ?? 0} />
        <MetricCard
          label="متوسط زمن المعالجة"
          value={formatLatencyMs(last24h.averageLatencyMs ?? status?.averageIngestToPublishLatencyMs)}
        />
      </div>
      {status?.lastRealPublication?.length ? (
        <p className="admin-news-page__hint">
          آخر منشور حقيقي: {formatGregorianDateTime(status.lastRealPublication[0]?.published_at, { compact: true })}
        </p>
      ) : null}

      {(() => {
        const editor = summary?.editorInChief || last24h?.editorInChief;
        const editorMode = summary?.editorMode || status?.editorMode || editor?.mode || "SHADOW";
        const chart = summary?.chartVisualPolicy || last24h?.chartVisualPolicy;
        if (!editor && !chart) return null;
        const reviewed = editor?.shadowReviewed ?? editor?.attempted ?? 0;
        const wouldApprove = editor?.shadowWouldApprove ?? editor?.approved ?? 0;
        const wouldRepair = editor?.shadowWouldRepair ?? editor?.repairSuccess ?? 0;
        const wouldBlock = editor?.shadowWouldBlock ?? 0;
        const timeout = editor?.shadowTimeout ?? editor?.timeout ?? 0;
        const approvalRate = reviewed > 0 ? `${Math.round((wouldApprove / reviewed) * 100)}%` : "—";
        const repairRate = reviewed > 0 ? `${Math.round((wouldRepair / reviewed) * 100)}%` : "—";
        const rejectionReasons = [
          ["numericMismatch", editor?.shadowIssueNumeric ?? editor?.numericMismatch],
          ["roleMismatch", editor?.shadowIssueRole ?? editor?.roleMismatch],
          ["entityMismatch", editor?.shadowIssueEntity ?? editor?.entityMismatch],
          ["attributionMismatch", editor?.shadowIssueAttribution ?? editor?.attributionMismatch],
          ["quoteMismatch", editor?.shadowIssueQuote ?? editor?.quoteMismatch],
          ["uncertaintyMismatch", editor?.shadowIssueUncertainty ?? editor?.uncertaintyMismatch],
          ["headlineBodyMismatch", editor?.headlineBodyMismatch],
          ["lowInformation", editor?.shadowIssueLowInformation],
        ]
          .filter(([, count]) => (count || 0) > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        return (
          <>
            <h3 className="admin-news-system__subtitle">
              Editor-in-Chief — آخر 24 ساعة
              <span className="admin-news-system__count">({editorMode === "SHADOW" ? "SHADOW" : editorMode})</span>
            </h3>
            <p className="admin-news-page__hint">
              Editor Mode: {editorMode}. قرارات الظل لا تُحسب ضمن الحظر الفعلي للنشر.
            </p>
            <div className="admin-news-system__metric-grid">
              <MetricCard label="تمت مراجعته (ظل)" value={reviewed} />
              <MetricCard label="wouldApprove" value={wouldApprove} />
              <MetricCard label="wouldRepair" value={wouldRepair} />
              <MetricCard label="wouldBlock" value={wouldBlock} />
              <MetricCard label="انتهت المهلة (ظل)" value={timeout} />
              <MetricCard label="نسبة wouldApprove" value={approvalRate} />
              <MetricCard label="نسبة wouldRepair" value={repairRate} />
              {chart ? (
                <MetricCard label="صور الرسم البياني (24س)" value={chart.chartImagesPublished ?? 0} />
              ) : null}
            </div>
            {rejectionReasons.length ? (
              <p className="admin-news-page__hint">
                أبرز أسباب الرفض: {rejectionReasons.map(([key, count]) => `${key} (${count})`).join(" · ")}
              </p>
            ) : null}
          </>
        );
      })()}

      {(() => {
        const v2 = summary?.editorV2 || status?.editorV2 || last24h?.editorV2;
        const v2Mode = summary?.editorV2Mode || status?.editorV2Mode || v2?.mode || "SHADOW";
        if (!v2) return null;
        const attempted = v2.shadowAttempted ?? 0;
        const passed = v2.shadowPassed ?? 0;
        const failed = v2.shadowFailed ?? 0;
        const passRate = attempted > 0 ? `${Math.round((passed / attempted) * 100)}%` : "—";
        return (
          <>
            <h3 className="admin-news-system__subtitle">
              Editor V2 — آخر 24 ساعة
              <span className="admin-news-system__count">({v2Mode})</span>
            </h3>
            <p className="admin-news-page__hint">
              Editor V2 Mode: {v2Mode}. V2 لا يؤثر على النشر الحي حالياً.
            </p>
            <div className="admin-news-system__metric-grid">
              <MetricCard label="V2 shadow attempted" value={attempted} />
              <MetricCard label="V2 shadow passed" value={passed} />
              <MetricCard label="V2 shadow failed" value={failed} />
              <MetricCard label="V2 pass rate" value={passRate} />
              <MetricCard label="V2 role mismatch" value={v2.shadowRoleMismatch ?? 0} />
              <MetricCard label="V2 numeric mismatch" value={v2.shadowNumericMismatch ?? 0} />
              <MetricCard label="V2 low information" value={v2.shadowLowInformation ?? 0} />
              <MetricCard
                label="V2 avg latency"
                value={formatLatencyMs(v2.shadowAverageLatencyMs)}
              />
            </div>
          </>
        );
      })()}

      <h3 className="admin-news-system__subtitle">المصادر</h3>
      {sources.length ? (
        <div className="admin-news-system__table-wrap">
          <table className="admin-news-system__table">
            <thead>
              <tr>
                <th scope="col">المصدر</th>
                <th scope="col">الحالة</th>
                <th scope="col">نجاح التحليل</th>
                <th scope="col">الأخطاء</th>
                <th scope="col">آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={`${source.sourceType}:${source.sourceId}`}>
                  <td className="admin-news-system__source-name">{source.sourceId || "—"}</td>
                  <td><HealthBadge value={source.state} /></td>
                  <td>{source.parseSuccessRate != null ? `${Math.round(source.parseSuccessRate * 100)}%` : "—"}</td>
                  <td>{source.sourceCausedConsecutive ?? 0}</td>
                  <td className="admin-news-system__mono">{formatGregorianDateTime(source.lastSeenAt, { compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-news-page__hint">لا توجد بيانات مصادر بعد. ستظهر بعد أول دورات المراقبة.</p>
      )}

      <h3 className="admin-news-system__subtitle">
        الحوادث المفتوحة
        <span className="admin-news-system__count">({incidents.length})</span>
      </h3>
      {incidents.length ? (
        <div className="admin-news-system__table-wrap">
          <table className="admin-news-system__table">
            <thead>
              <tr>
                <th scope="col">النوع</th>
                <th scope="col">الخطورة</th>
                <th scope="col">المصدر</th>
                <th scope="col">العدد</th>
                <th scope="col">آخر ظهور</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.incidentId}>
                  <td>{incident.type}</td>
                  <td><SeverityBadge value={incident.severity} /></td>
                  <td>{incident.affectedSource || "—"}</td>
                  <td>{incident.count}</td>
                  <td className="admin-news-system__mono">{formatGregorianDateTime(incident.lastSeenAt, { compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-news-page__hint">لا توجد حوادث مفتوحة.</p>
      )}
    </section>
  );
}
