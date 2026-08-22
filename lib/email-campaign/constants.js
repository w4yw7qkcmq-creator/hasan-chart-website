/** Email campaign status constants and transition rules. */
export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  PREPARING: "preparing",
  READY: "ready",
  SENDING: "sending",
  PAUSED: "paused",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
});

export const CAMPAIGN_AUDIENCE_TYPES = Object.freeze({
  ALL_ELIGIBLE: "all_eligible",
  SELECTED_USERS: "selected_users",
  ACTIVE_SUBSCRIBERS: "active_subscribers",
  NON_SUBSCRIBERS: "non_subscribers",
});

export const CAMPAIGN_EDITABLE_STATUSES = new Set([
  CAMPAIGN_STATUS.DRAFT,
  CAMPAIGN_STATUS.READY,
]);

export const CAMPAIGN_TRANSITIONS = Object.freeze({
  [CAMPAIGN_STATUS.DRAFT]: new Set([
    CAMPAIGN_STATUS.PREPARING,
    CAMPAIGN_STATUS.READY,
    CAMPAIGN_STATUS.CANCELLED,
  ]),
  [CAMPAIGN_STATUS.PREPARING]: new Set([
    CAMPAIGN_STATUS.READY,
    CAMPAIGN_STATUS.DRAFT,
    CAMPAIGN_STATUS.FAILED,
    CAMPAIGN_STATUS.CANCELLED,
  ]),
  [CAMPAIGN_STATUS.READY]: new Set([
    CAMPAIGN_STATUS.SENDING,
    CAMPAIGN_STATUS.DRAFT,
    CAMPAIGN_STATUS.CANCELLED,
  ]),
  [CAMPAIGN_STATUS.SENDING]: new Set([
    CAMPAIGN_STATUS.PAUSED,
    CAMPAIGN_STATUS.COMPLETED,
    CAMPAIGN_STATUS.CANCELLED,
    CAMPAIGN_STATUS.FAILED,
  ]),
  [CAMPAIGN_STATUS.PAUSED]: new Set([
    CAMPAIGN_STATUS.SENDING,
    CAMPAIGN_STATUS.CANCELLED,
  ]),
  [CAMPAIGN_STATUS.COMPLETED]: new Set([]),
  [CAMPAIGN_STATUS.CANCELLED]: new Set([]),
  [CAMPAIGN_STATUS.FAILED]: new Set([CAMPAIGN_STATUS.DRAFT]),
});

export function canTransitionCampaignStatus(from, to) {
  const normalizedFrom = String(from || "").trim();
  const normalizedTo = String(to || "").trim();
  return CAMPAIGN_TRANSITIONS[normalizedFrom]?.has(normalizedTo) === true;
}

export function canEditCampaignContent(status) {
  return CAMPAIGN_EDITABLE_STATUSES.has(String(status || "").trim());
}

export function canPrepareAudience(status) {
  const s = String(status || "").trim();
  return s === CAMPAIGN_STATUS.DRAFT || s === CAMPAIGN_STATUS.READY;
}

export function canLaunchCampaign(status) {
  return String(status || "").trim() === CAMPAIGN_STATUS.READY;
}

export function canPauseCampaign(status) {
  return String(status || "").trim() === CAMPAIGN_STATUS.SENDING;
}

export function canResumeCampaign(status) {
  return String(status || "").trim() === CAMPAIGN_STATUS.PAUSED;
}

export function canCancelCampaign(status) {
  const s = String(status || "").trim();
  return [
    CAMPAIGN_STATUS.DRAFT,
    CAMPAIGN_STATUS.PREPARING,
    CAMPAIGN_STATUS.READY,
    CAMPAIGN_STATUS.SENDING,
    CAMPAIGN_STATUS.PAUSED,
  ].includes(s);
}

export function buildCampaignOutboxIdempotencyKey(campaignId, recipientId) {
  return `campaign/${String(campaignId).trim()}/recipient/${String(recipientId).trim()}`;
}

export const CAMPAIGN_OUTBOX_PRIORITY = 10;
export const TRANSACTIONAL_OUTBOX_PRIORITY = 0;
