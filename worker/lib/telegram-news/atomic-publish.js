const { validateFinalEditorialQuality } = require("./editorial-quality");
const { validateFinalMessageAgainstFacts } = require("./invariants");
const { isGenericTitle, normalizeTitleText } = require("./editorial-title");
const { sanitizeChannelArtifacts, assertNoChannelArtifacts } = require("./channel-sanitizer");
const { buildPublishFingerprintBundle } = require("./semantic-fingerprints");
const { isSourcePublishable, updateBaselineAfterPublish } = require("./publish-state");
const { buildPremiumImageContextFromCandidate } = require("../news-images/important-events");
const {
  PUBLISH_STATES,
  createPublishLegState,
  transitionPublishLegState,
  resolveRetryLeg,
} = require("../news-publish-state");
const { createNewsPublisherGateway } = require("../news-intelligence/publisher-gateway");
const { buildTelegramPublicationRequest } = require("../news-intelligence/adapters");
const { maybeApplyPhase2Editorial } = require("../news-intelligence/economic-editorial/integration");
const { recordDecision } = require("../news-intelligence/autonomy/decision-record");
const { createCorrelationId } = require("../news-intelligence/autonomy/structured-log");
const { getEventFamily } = require("../news-intelligence/event-registry");
const { DECISION_OUTCOMES } = require("../news-intelligence/autonomy/reason-taxonomy");

let gatewayInstance = null;

function getAtomicPublishGateway(deps = {}) {
  if (!gatewayInstance) {
    gatewayInstance = createNewsPublisherGateway({
      supabase: deps.supabase || null,
      runtimeMode: deps.runtimeMode || (deps.dryRun ? "test" : undefined),
      forceMemory: deps.forceMemory === true,
    });
  }
  return gatewayInstance;
}

function resetAtomicPublishGatewayForTests() {
  gatewayInstance = null;
}

/** @type {Set<string>} */
const memoryReservations = new Set();

/** @type {Map<string, { state: string, telegramSent?: boolean, dbInserted?: boolean, sourceLink?: string }>} */
const publishStates = new Map();

function releaseMemoryReservation(fingerprint) {
  if (fingerprint) {
    memoryReservations.delete(fingerprint);
  }
}

function isFingerprintAlreadyPublished(fingerprint, options = {}) {
  if (options.existingFingerprints?.has?.(fingerprint)) {
    return true;
  }

  const links = options.existingLinks || [];
  const reserveMarker = `tg-reserve:${fingerprint}`;
  if (links.includes(reserveMarker)) {
    return true;
  }

  const normalizedMatches = options.existingNormalizedTitles || [];
  const fingerprintPrefix = fingerprint.slice(0, 120);
  return normalizedMatches.some(
    (value) => value === fingerprint || value === fingerprintPrefix || String(value || "").includes(fingerprintPrefix)
  );
}

function extractResolvedTitle(message) {
  const match = String(message || "").match(/^🚨\s*(.+?)(?:\n|$)/);
  return match ? normalizeTitleText(match[1]) : "";
}

function validateCandidateForAtomicPublish(candidate, context = {}) {
  const issues = [];
  const message = String(candidate.formattedMessage || "");

  const publishable = isSourcePublishable(candidate.post);
  if (!publishable.ok) {
    issues.push(publishable.reason);
  }

  if (candidate.skipPublish) {
    issues.push(candidate.reason || "skip_publish");
  }

  if (!message || message.length < 40) {
    issues.push("message_too_short");
  }

  const resolvedTitle = candidate.resolvedTitle || extractResolvedTitle(message);
  if (!resolvedTitle || isGenericTitle(resolvedTitle)) {
    issues.push("GENERIC_TITLE_FINAL_REJECTED");
  }

  const template =
    candidate.newsType === "economic" ? "economic" : candidate.newsType === "pre_event" ? "pre_event" : "general";

  const qualityCheck = validateFinalEditorialQuality(message, candidate.facts || {}, {
    template,
    sourceText: candidate.post?.rawText || "",
    storyCount: candidate.post?._storyCount || 1,
  });
  if (!qualityCheck.ok) {
    issues.push(...qualityCheck.issues);
  }

  const factCheck = validateFinalMessageAgainstFacts(message, candidate.facts || {});
  if (!factCheck.ok) {
    issues.push(factCheck.reason || "FINAL_MESSAGE_FACT_MISMATCH");
  }

  const sanitized = sanitizeChannelArtifacts(message);
  const artifactCheck = assertNoChannelArtifacts(sanitized);
  if (!artifactCheck.ok) {
    issues.push(...artifactCheck.issues);
  }

  if (!sanitized || sanitized.length < 40) {
    issues.push("sanitized_message_empty");
  }

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    reason: issues[0] || null,
    resolvedTitle,
    sanitizedMessage: sanitized,
    qualityCheck,
    factCheck,
  };
}

async function reserveNewsPublishFingerprint(candidate, options = {}) {
  const bundle = buildPublishFingerprintBundle(candidate);
  const fingerprint = bundle.composite;
  const sourceLink =
    candidate.post?.sourceUrl || `telegram:${candidate.post?.sourceChannel}/${candidate.post?.sourceMessageId}`;

  if (memoryReservations.has(fingerprint)) {
    return { reserved: false, reason: "duplicate_skip", fingerprint, bundle };
  }

  if (options.existingLinks?.includes?.(sourceLink)) {
    return { reserved: false, reason: "duplicate_skip", fingerprint, bundle, sourceLink };
  }

  if (isFingerprintAlreadyPublished(fingerprint, options)) {
    return { reserved: false, reason: "duplicate_skip", fingerprint, bundle, sourceLink };
  }

  memoryReservations.add(fingerprint);
  publishStates.set(fingerprint, { state: "reserved", sourceLink });
  return { reserved: true, fingerprint, bundle, sourceLink, memoryOnly: true };
}

function resolveTerminalReasonCode(evaluation = {}) {
  if (evaluation.detail && evaluation.detail !== evaluation.reason) {
    const detail = String(evaluation.detail).trim();
    if (detail === "MISSING_CANONICAL_EVENT") {
      return "MISSING_CANONICAL_EVENT";
    }
  }
  return evaluation.reason || evaluation.detail || "QUALITY_GATE_BLOCKED";
}

function recordTerminalEconomicDecision(candidate, publication, ctx = {}, evaluation = {}) {
  if (candidate?.newsType !== "economic" && publication?.sourceType !== "telegram_economic") {
    return null;
  }

  const correlationId = evaluation.correlationId || createCorrelationId("news");
  const reasonCode = resolveTerminalReasonCode(evaluation);

  return recordDecision({
    correlationId,
    eventKey: publication?.eventKey || null,
    eventType: publication?.eventType || candidate?.facts?.canonicalEventKey || null,
    eventFamily: getEventFamily(publication?.eventType || candidate?.facts?.canonicalEventKey),
    sourceType: publication?.sourceType || "telegram_economic",
    sourceId: publication?.sourceId || candidate?.post?.sourceChannel || null,
    sourceMessageId: candidate?.post?.sourceMessageId || publication?.metadata?.rawMessageId || null,
    sourceLink:
      publication?.sourceLink ||
      candidate?.post?.sourceUrl ||
      `telegram:${candidate?.post?.sourceChannel}/${candidate?.post?.sourceMessageId}`,
    receivedAt: candidate?.post?.sourcePublishedAt || null,
    reasonCode,
    decision: DECISION_OUTCOMES.BLOCKED,
    importance: publication?.importance || "HIGH",
    qualityStatus: "blocked",
    metadata: {
      stage: evaluation.stage || "phase2_editorial",
      subReason: evaluation.detail || evaluation.reason || null,
      mergeKey: ctx.mergeKey || null,
      titlePreview: String(candidate?.facts?.title || publication?.title || "").slice(0, 120),
    },
    latency: evaluation.latency || null,
  });
}

async function publishValidatedTelegramNewsCandidate(candidate, ctx = {}, deps = {}) {
  const validation = validateCandidateForAtomicPublish(candidate, ctx);
  if (!validation.ok) {
    const publication = buildTelegramPublicationRequest(candidate, validation, ctx);
    recordTerminalEconomicDecision(candidate, publication, ctx, {
      reason: validation.reason || validation.issues?.[0] || "FINAL_ATOMIC_PUBLISH_REJECTED",
      stage: "atomic_validation",
    });
    console.log(
      "FINAL_ATOMIC_PUBLISH_REJECTED",
      JSON.stringify({
        reasons: validation.issues.slice(0, 8),
        sourceMessageId: candidate.post?.sourceMessageId,
        mergeKey: ctx.mergeKey,
      })
    );
    return { skipped: true, reason: validation.reason || "FINAL_ATOMIC_PUBLISH_REJECTED", validation };
  }

  const message = validation.sanitizedMessage;
  const reserve = await reserveNewsPublishFingerprint(candidate, deps);
  if (!reserve.reserved) {
    const publication = buildTelegramPublicationRequest(candidate, validation, ctx);
    recordTerminalEconomicDecision(candidate, publication, ctx, {
      reason: reserve.reason === "duplicate_skip" ? "DUPLICATE_BLOCKED" : reserve.reason || "DUPLICATE_BLOCKED",
      stage: "idempotency",
    });
    console.log(
      "FINAL_ATOMIC_PUBLISH_REJECTED",
      JSON.stringify({
        reasons: [reserve.reason || "duplicate_skip"],
        fingerprint: reserve.fingerprint,
        sourceMessageId: candidate.post?.sourceMessageId,
      })
    );
    return { skipped: true, reason: reserve.reason || "duplicate_skip", fingerprint: reserve.fingerprint };
  }

  const fingerprint = reserve.fingerprint;
  let legState = createPublishLegState({
    state: PUBLISH_STATES.RESERVED,
    fingerprint,
    sourceLink:
      candidate.post?.sourceUrl || `telegram:${candidate.post?.sourceChannel}/${candidate.post?.sourceMessageId}`,
  });

  if (deps.dryRun) {
    legState = transitionPublishLegState(legState, {
      state: PUBLISH_STATES.COMPLETED,
      telegramSent: true,
      siteInserted: true,
      publishedNewsRecorded: true,
    });
    publishStates.set(fingerprint, { ...legState, dryRun: true });
    return {
      dryRun: true,
      published: true,
      state: "completed",
      fingerprint,
      message,
      resolvedTitle: validation.resolvedTitle,
      premiumImage: Boolean(buildPremiumImageContextFromCandidate(candidate)),
    };
  }

  const publication = buildTelegramPublicationRequest(candidate, validation, ctx);
  const phase2Result = await maybeApplyPhase2Editorial(publication, deps);
  if (!phase2Result.ok) {
    releaseMemoryReservation(fingerprint);
    publishStates.delete(fingerprint);
    recordTerminalEconomicDecision(candidate, publication, ctx, {
      reason: phase2Result.reason || "QUALITY_GATE_BLOCKED",
      detail: phase2Result.detail || phase2Result.quality?.detail || null,
      stage: phase2Result.stage || "quality_gate",
    });
    console.log(
      "PHASE2_EDITORIAL_BLOCKED",
      JSON.stringify({
        reason: phase2Result.reason,
        stage: phase2Result.stage,
        sourceMessageId: candidate.post?.sourceMessageId,
      })
    );
    return {
      skipped: true,
      reason: phase2Result.reason || "PHASE2_EDITORIAL_BLOCKED",
      blocked: true,
    };
  }
  const enrichedPublication = phase2Result.publication;
  const gateway = getAtomicPublishGateway(deps);
  const gatewayResult = await gateway.publish(enrichedPublication, {
    dryRun: deps.dryRun,
    supabase: deps.supabase || null,
    resolvePublicationImageResult: require("../news-images/image-orchestrator").resolvePublicationImageResult,
    sendTelegramMessage: deps.sendTelegramMessage,
    sendTelegramPhoto: deps.sendTelegramPhoto,
    saveNewsPostToSupabase: deps.saveNewsPostToSupabase,
    savePublishedNewsToSupabase: deps.savePublishedNewsToSupabase,
    savePublishedNewsLink: deps.savePublishedNewsLink,
  });

  if (gatewayResult.blocked) {
    releaseMemoryReservation(fingerprint);
    publishStates.delete(fingerprint);
    recordTerminalEconomicDecision(candidate, publication, ctx, {
      reason: gatewayResult.reason || "GATEWAY_BLOCKED",
      detail: gatewayResult.stage || "gateway",
      stage: gatewayResult.stage || "gateway",
    });
    console.log(
      "FINAL_ATOMIC_PUBLISH_REJECTED",
      JSON.stringify({
        reasons: [gatewayResult.reason || "gateway_blocked"],
        fingerprint,
        eventKey: gatewayResult.eventKey,
        sourceMessageId: candidate.post?.sourceMessageId,
      })
    );
    return {
      skipped: true,
      reason: gatewayResult.reason || "gateway_blocked",
      fingerprint,
      eventKey: gatewayResult.eventKey,
      stage: gatewayResult.stage,
    };
  }

  if (gatewayResult.failed) {
    recordTerminalEconomicDecision(candidate, publication, ctx, {
      reason: gatewayResult.reason || "DELIVERY_FAILED",
      stage: gatewayResult.stage || "gateway_delivery",
    });
    legState = transitionPublishLegState(legState, {
      state: PUBLISH_STATES.FAILED_RETRYABLE,
      retryable: true,
      reason: gatewayResult.reason,
    });
    publishStates.set(fingerprint, legState);
    releaseMemoryReservation(fingerprint);
    return { failed: true, state: legState.state, reason: gatewayResult.reason, fingerprint, legState };
  }

  const telegramSent = gatewayResult.telegramSent !== false;
  const dbInserted = gatewayResult.siteInserted !== false;

  if (telegramSent && !dbInserted) {
    legState = transitionPublishLegState(legState, {
      telegramSent: true,
      siteInserted: false,
      state: PUBLISH_STATES.TELEGRAM_PUBLISHED,
      retryable: true,
      reason: "db_insert_failed",
      publicationRecord: gatewayResult.publicationRecord || null,
    });
    publishStates.set(fingerprint, legState);
    return {
      partial: true,
      state: legState.state,
      reason: "db_insert_failed",
      fingerprint,
      telegramSent: true,
      dbInserted: false,
      retryLeg: resolveRetryLeg(legState),
      legState,
    };
  }

  legState = transitionPublishLegState(legState, {
    telegramSent,
    siteInserted: dbInserted,
    state: PUBLISH_STATES.COMPLETED,
    retryable: false,
    publicationRecord: gatewayResult.publicationRecord || null,
    storedPublication: gatewayResult.editorial
      ? {
          title: publication.title,
          body: gatewayResult.editorial.body,
          sourceLink: publication.sourceLink,
          facts: publication.facts,
          eventType: gatewayResult.eventKey ? publication.eventType : null,
        }
      : null,
  });
  publishStates.set(fingerprint, legState);
  updateBaselineAfterPublish(candidate.post);

  return {
    published: true,
    dryRun: gatewayResult.dryRun === true,
    state: legState.state,
    fingerprint,
    sourceLink: publication.sourceLink,
    resolvedTitle: validation.resolvedTitle,
    messageLength: message.length,
    telegramSent,
    dbInserted,
    eventKey: gatewayResult.eventKey,
    legState,
  };
}

async function retryPublishLeg(candidate, legState, ctx = {}, deps = {}) {
  const retryLeg = resolveRetryLeg(legState);
  if (!retryLeg) {
    return { skipped: true, reason: "nothing_to_retry", legState };
  }

  if (!legState.publicationRecord) {
    return { skipped: true, reason: "retry_publication_record_missing", legState };
  }

  const gateway = getAtomicPublishGateway(deps);
  const gatewayResult = await gateway.retryDelivery(
    legState.publicationRecord,
    {
      retryLeg: retryLeg === "telegram_only" ? "telegram_only" : retryLeg === "site_only" ? "site_only" : "full",
      destination: "both",
    },
    {
      dryRun: deps.dryRun,
      deliverTelegramNews: deps.deliverTelegramNews,
      sendTelegramMessage: deps.sendTelegramMessage,
      sendTelegramPhoto: deps.sendTelegramPhoto,
      saveNewsPostToSupabase: deps.saveNewsPostToSupabase,
      savePublishedNewsToSupabase: deps.savePublishedNewsToSupabase,
      savePublishedNewsLink: deps.savePublishedNewsLink,
    }
  );

  if (gatewayResult.failed) {
    const nextState = transitionPublishLegState(legState, {
      retryable: true,
      reason: gatewayResult.reason || "retry_failed",
      telegramSent: gatewayResult.telegramSent === true,
      siteInserted: gatewayResult.siteInserted === true,
      state:
        gatewayResult.telegramSent && !gatewayResult.siteInserted
          ? PUBLISH_STATES.TELEGRAM_PUBLISHED
          : legState.state,
    });
    publishStates.set(legState.fingerprint, nextState);
    return {
      failed: true,
      reason: gatewayResult.reason,
      retryLeg,
      legState: nextState,
      partial: gatewayResult.partial === true,
    };
  }

  const nextState = transitionPublishLegState(legState, {
    telegramSent: gatewayResult.telegramSent !== false,
    siteInserted: gatewayResult.siteInserted !== false,
    state: gatewayResult.published ? PUBLISH_STATES.COMPLETED : PUBLISH_STATES.TELEGRAM_PUBLISHED,
    retryable: !gatewayResult.published,
    publicationRecord: gatewayResult.publicationRecord || legState.publicationRecord,
  });
  publishStates.set(legState.fingerprint, nextState);

  return {
    published: nextState.state === PUBLISH_STATES.COMPLETED,
    partial: gatewayResult.partial === true,
    retryLeg,
    legState: nextState,
    telegramSent: gatewayResult.telegramSent,
    dbInserted: gatewayResult.siteInserted,
  };
}

function resetAtomicPublishForTests() {
  memoryReservations.clear();
  publishStates.clear();
  resetAtomicPublishGatewayForTests();
}

function getPublishStateForFingerprint(fingerprint) {
  return publishStates.get(fingerprint) || null;
}

module.exports = {
  validateCandidateForAtomicPublish,
  reserveNewsPublishFingerprint,
  publishValidatedTelegramNewsCandidate,
  retryPublishLeg,
  extractResolvedTitle,
  resetAtomicPublishForTests,
  resetAtomicPublishGatewayForTests,
  getPublishStateForFingerprint,
  releaseMemoryReservation,
  isFingerprintAlreadyPublished,
};
