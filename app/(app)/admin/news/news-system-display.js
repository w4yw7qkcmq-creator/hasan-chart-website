const GREGORIAN_LOCALE = "ar-EG-u-ca-gregory";
const SYNTHETIC_SOURCE_MARKERS = ["CANARY_SYNTHETIC_SOURCE", "CANARY_"];
const SYNTHETIC_SOURCE_TYPES = new Set(["canary", "synthetic", "test"]);

export function formatGregorianDateTime(value, { compact = false } = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const datePart = date.toLocaleDateString(GREGORIAN_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    calendar: "gregory",
  });
  const timePart = date.toLocaleTimeString(GREGORIAN_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    calendar: "gregory",
  });

  return compact ? `${datePart} - ${timePart}` : `${datePart}\n${timePart}`;
}

export function formatRelativeAge(fromMs, nowMs = Date.now()) {
  if (!fromMs) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (diffSec < 5) return "الآن";
  if (diffSec < 60) return `منذ ${diffSec} ثانية`;
  const mins = Math.floor(diffSec / 60);
  if (mins === 1) return "منذ دقيقة";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "منذ ساعة" : `منذ ${hours} ساعة`;
}

export function formatLatencyMs(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value))} ms`;
}

export function isSyntheticSource(source = {}) {
  const sourceId = String(source.sourceId || "").toUpperCase();
  const sourceType = String(source.sourceType || "").toLowerCase();
  if (SYNTHETIC_SOURCE_TYPES.has(sourceType)) return true;
  return SYNTHETIC_SOURCE_MARKERS.some((marker) => sourceId.includes(marker));
}

export function isSyntheticIncident(incident = {}) {
  const incidentId = String(incident.incidentId || "").toUpperCase();
  const affectedSource = String(incident.affectedSource || "").toUpperCase();
  const incidentType = String(incident.type || incident.incident_type || "").toUpperCase();
  if (incidentId.startsWith("CANARY-") || incidentId.includes("CANARY")) return true;
  if (affectedSource.includes("CANARY")) return true;
  if (incidentType.includes("CANARY") || incidentType.includes("SYNTHETIC")) return true;
  return false;
}

export function filterProductionSources(sources = []) {
  return sources.filter((source) => !isSyntheticSource(source));
}

export function filterProductionIncidents(incidents = []) {
  return incidents.filter((incident) => !isSyntheticIncident(incident));
}

export const STATE_LABELS = {
  HEALTHY: "سليم",
  DEGRADED: "متدهور",
  QUARANTINED: "معزول",
  RECOVERING: "يتعافى",
  CRITICAL: "حرج",
};

export const SEVERITY_LABELS = {
  INFO: "معلومات",
  WARNING: "تحذير",
  HIGH: "مرتفع",
  CRITICAL: "حرج",
};

export function healthBadgeClass(value) {
  const normalized = String(value || "unknown").toUpperCase();
  if (normalized === "HEALTHY") return "admin-news-system__badge admin-news-system__badge--healthy";
  if (normalized === "DEGRADED") return "admin-news-system__badge admin-news-system__badge--degraded";
  if (normalized === "QUARANTINED") return "admin-news-system__badge admin-news-system__badge--quarantined";
  if (normalized === "RECOVERING") return "admin-news-system__badge admin-news-system__badge--recovering";
  if (normalized === "CRITICAL") return "admin-news-system__badge admin-news-system__badge--critical";
  return "admin-news-system__badge admin-news-system__badge--neutral";
}

export function severityBadgeClass(value) {
  const normalized = String(value || "unknown").toUpperCase();
  if (normalized === "INFO") return "admin-news-system__badge admin-news-system__badge--info";
  if (normalized === "WARNING") return "admin-news-system__badge admin-news-system__badge--warning";
  if (normalized === "HIGH") return "admin-news-system__badge admin-news-system__badge--high";
  if (normalized === "CRITICAL") return "admin-news-system__badge admin-news-system__badge--critical";
  return "admin-news-system__badge admin-news-system__badge--neutral";
}

export function toggleBadgeClass(enabled) {
  return enabled
    ? "admin-news-system__badge admin-news-system__badge--enabled"
    : "admin-news-system__badge admin-news-system__badge--disabled";
}

export const NEWS_SYSTEM_REFRESH_MS = 30_000;
