import { LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS } from "./leaderboard-public.js";

/**
 * Canonical partner-facing leaderboard entry (no PII / private economics).
 */
export function toPublicLeaderboardEntry(row = {}) {
  return {
    rank: Number(row.rank),
    displayLabel: String(row.displayLabel || row.display_label || "Partner ****"),
    publicScore: Number(row.publicScore ?? row.metric_value ?? 0),
    metric: String(row.metric || row.ranking_metric || ""),
    periodKey: String(row.periodKey || row.period_key || ""),
    tierBadge: row.tierBadge ?? row.metadata?.tierBadge ?? null,
  };
}

export function assertPublicLeaderboardPayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.entries || [];
  for (const row of rows) {
    for (const key of LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS) {
      if (key in row) {
        throw new Error(`leaderboard_privacy_violation:${key}`);
      }
    }
  }
  return true;
}

export { LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS };
