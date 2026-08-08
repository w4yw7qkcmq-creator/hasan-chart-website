const PUBLISH_STATES = {
  DISCOVERED: "discovered",
  RESERVED: "reserved",
  TELEGRAM_PENDING: "telegram_pending",
  TELEGRAM_PUBLISHED: "telegram_published",
  SITE_PENDING: "site_pending",
  SITE_PUBLISHED: "site_published",
  COMPLETED: "completed",
  FAILED_RETRYABLE: "failed_retryable",
  FAILED_TERMINAL: "failed_terminal",
  DEDUPE_MARKER: "dedupe_marker",
};

function createPublishLegState(initial = {}) {
  return {
    state: initial.state || PUBLISH_STATES.RESERVED,
    fingerprint: initial.fingerprint || null,
    sourceLink: initial.sourceLink || null,
    telegramSent: Boolean(initial.telegramSent),
    telegramMessageId: initial.telegramMessageId || null,
    siteInserted: Boolean(initial.siteInserted),
    sitePostId: initial.sitePostId || null,
    publishedNewsRecorded: Boolean(initial.publishedNewsRecorded),
    retryable: Boolean(initial.retryable),
    reason: initial.reason || null,
    publicationRecord: initial.publicationRecord || null,
    updatedAt: new Date().toISOString(),
  };
}

function transitionPublishLegState(state, patch = {}) {
  const next = {
    ...state,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (patch.telegramSent && !next.siteInserted && next.state !== PUBLISH_STATES.COMPLETED) {
    next.state = PUBLISH_STATES.TELEGRAM_PUBLISHED;
    next.retryable = true;
  }
  if (patch.siteInserted && next.telegramSent) {
    next.state = PUBLISH_STATES.COMPLETED;
    next.retryable = false;
  }
  if (patch.siteInserted && !next.telegramSent) {
    next.state = PUBLISH_STATES.SITE_PUBLISHED;
    next.retryable = true;
  }
  if (patch.publishedNewsRecorded && next.state === PUBLISH_STATES.RESERVED) {
    next.state = PUBLISH_STATES.SITE_PENDING;
  }

  return next;
}

function resolveRetryLeg(state) {
  if (!state) return null;
  if (state.state === PUBLISH_STATES.COMPLETED || state.state === PUBLISH_STATES.DEDUPE_MARKER) {
    return null;
  }
  if (state.telegramSent && !state.siteInserted) {
    return "site_only";
  }
  if (state.siteInserted && !state.telegramSent) {
    return "telegram_only";
  }
  if (state.state === PUBLISH_STATES.RESERVED || state.state === PUBLISH_STATES.DISCOVERED) {
    return "full";
  }
  return state.retryable ? "full" : null;
}

function isTerminalPublishFailure(state) {
  return state?.state === PUBLISH_STATES.FAILED_TERMINAL;
}

module.exports = {
  PUBLISH_STATES,
  createPublishLegState,
  transitionPublishLegState,
  resolveRetryLeg,
  isTerminalPublishFailure,
};
