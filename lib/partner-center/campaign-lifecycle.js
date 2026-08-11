import { CAMPAIGN_PROGRAM_STATUSES } from "./phase2-constants.js";
import { isWithinWindow } from "./timezone.js";

const TERMINAL_STATUSES = new Set([
  CAMPAIGN_PROGRAM_STATUSES.COMPLETED,
  CAMPAIGN_PROGRAM_STATUSES.CANCELLED,
]);

/** Action → { fromStatus → toStatus } */
export const CAMPAIGN_TRANSITION_MATRIX = Object.freeze({
  schedule: Object.freeze({
    [CAMPAIGN_PROGRAM_STATUSES.DRAFT]: CAMPAIGN_PROGRAM_STATUSES.SCHEDULED,
  }),
  activate: Object.freeze({
    [CAMPAIGN_PROGRAM_STATUSES.DRAFT]: CAMPAIGN_PROGRAM_STATUSES.ACTIVE,
    [CAMPAIGN_PROGRAM_STATUSES.SCHEDULED]: CAMPAIGN_PROGRAM_STATUSES.ACTIVE,
    [CAMPAIGN_PROGRAM_STATUSES.PAUSED]: CAMPAIGN_PROGRAM_STATUSES.ACTIVE,
  }),
  pause: Object.freeze({
    [CAMPAIGN_PROGRAM_STATUSES.ACTIVE]: CAMPAIGN_PROGRAM_STATUSES.PAUSED,
  }),
  resume: Object.freeze({
    [CAMPAIGN_PROGRAM_STATUSES.PAUSED]: CAMPAIGN_PROGRAM_STATUSES.ACTIVE,
  }),
  complete: Object.freeze({
    [CAMPAIGN_PROGRAM_STATUSES.ACTIVE]: CAMPAIGN_PROGRAM_STATUSES.COMPLETED,
    [CAMPAIGN_PROGRAM_STATUSES.PAUSED]: CAMPAIGN_PROGRAM_STATUSES.COMPLETED,
    [CAMPAIGN_PROGRAM_STATUSES.SCHEDULED]: CAMPAIGN_PROGRAM_STATUSES.COMPLETED,
  }),
  cancel: Object.freeze({
    [CAMPAIGN_PROGRAM_STATUSES.DRAFT]: CAMPAIGN_PROGRAM_STATUSES.CANCELLED,
    [CAMPAIGN_PROGRAM_STATUSES.SCHEDULED]: CAMPAIGN_PROGRAM_STATUSES.CANCELLED,
    [CAMPAIGN_PROGRAM_STATUSES.ACTIVE]: CAMPAIGN_PROGRAM_STATUSES.CANCELLED,
    [CAMPAIGN_PROGRAM_STATUSES.PAUSED]: CAMPAIGN_PROGRAM_STATUSES.CANCELLED,
  }),
});

export function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === CAMPAIGN_PROGRAM_STATUSES.ENDED) {
    return CAMPAIGN_PROGRAM_STATUSES.COMPLETED;
  }
  return s;
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(normalizeStatus(status));
}

export function assertTransition(currentStatus, action) {
  const from = normalizeStatus(currentStatus);
  const matrix = CAMPAIGN_TRANSITION_MATRIX[action];
  if (!matrix) {
    return { ok: false, error: "unknown_action", action, fromStatus: from };
  }
  const to = matrix[from];
  if (!to) {
    return { ok: false, error: "invalid_transition", action, fromStatus: from };
  }
  return { ok: true, fromStatus: from, toStatus: to, action };
}

export function canCampaignAcceptProgress(campaign, { at = new Date() } = {}) {
  if (!campaign?.id) return { ok: false, reason: "missing_campaign" };
  const status = normalizeStatus(campaign.status);
  if (status !== CAMPAIGN_PROGRAM_STATUSES.ACTIVE) {
    return { ok: false, reason: "campaign_not_active", status };
  }
  if (!isWithinWindow(campaign.start_at, campaign.end_at, at)) {
    return { ok: false, reason: "outside_campaign_window" };
  }
  return { ok: true, status };
}

export function canCampaignAcceptAttribution(campaign, { at = new Date() } = {}) {
  if (!campaign?.id) return { ok: false, reason: "missing_campaign" };
  const status = normalizeStatus(campaign.status);
  const allowed = [
    CAMPAIGN_PROGRAM_STATUSES.ACTIVE,
    CAMPAIGN_PROGRAM_STATUSES.SCHEDULED,
  ];
  if (!allowed.includes(status)) {
    return { ok: false, reason: "campaign_not_attributable", status };
  }
  if (!isWithinWindow(campaign.start_at, campaign.end_at, at)) {
    return { ok: false, reason: "outside_campaign_window" };
  }
  return { ok: true, status };
}
