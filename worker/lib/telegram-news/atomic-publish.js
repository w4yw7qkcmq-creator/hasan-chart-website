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

async function publishValidatedTelegramNewsCandidate(candidate, ctx = {}, deps = {}) {
  const validation = validateCandidateForAtomicPublish(candidate, ctx);
  if (!validation.ok) {
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

  try {
    if (deps.deliverTelegramNews) {
      const delivery = await deps.deliverTelegramNews({ message, candidate, dryRun: deps.dryRun });
      legState = transitionPublishLegState(legState, {
        telegramSent: true,
        telegramMessageId: delivery?.telegramMessageId || null,
        state: PUBLISH_STATES.TELEGRAM_PUBLISHED,
      });
      if (delivery?.premiumImage === true) {
        legState.premiumImage = true;
      }
    } else {
      const delivery = await deps.sendTelegramMessage(message);
      if (delivery?.ok === false) {
        throw new Error(delivery.error || "telegram_send_failed");
      }
      legState = transitionPublishLegState(legState, {
        telegramSent: true,
        telegramMessageId: delivery?.telegramMessageId || delivery?.message_id || null,
        state: PUBLISH_STATES.TELEGRAM_PUBLISHED,
      });
    }
  } catch (error) {
    legState = transitionPublishLegState(legState, {
      state: PUBLISH_STATES.FAILED_RETRYABLE,
      retryable: true,
      reason: error.message,
    });
    publishStates.set(fingerprint, legState);
    releaseMemoryReservation(fingerprint);
    return { failed: true, state: legState.state, reason: error.message, fingerprint, legState };
  }

  const sourceLink = legState.sourceLink;
  const dbTitle = validation.resolvedTitle || candidate.facts?.title || "خبر سوق";
  const impactLevel = candidate.newsType === "economic" ? "HIGH" : "MEDIUM";

  if (deps.savePublishedNewsToSupabase) {
    await deps.savePublishedNewsToSupabase({
      link: sourceLink,
      title: `${dbTitle} ${message}`.slice(0, 500),
      normalized_title: dbTitle.slice(0, 500),
      topic_cluster: fingerprint.slice(0, 120),
      published_at: new Date().toISOString(),
      telegramFingerprint: fingerprint,
    });
    legState = transitionPublishLegState(legState, { publishedNewsRecorded: true });
  }

  const saveResult = await deps.saveNewsPostToSupabase({
    title: dbTitle,
    content: message,
    image_url: null,
    impact_level: impactLevel,
    source_link: sourceLink,
  });

  if (saveResult?.error) {
    legState = transitionPublishLegState(legState, {
      siteInserted: false,
      state: PUBLISH_STATES.TELEGRAM_PUBLISHED,
      retryable: true,
      reason: "db_insert_failed",
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
    siteInserted: true,
    sitePostId: saveResult?.id || null,
    state: PUBLISH_STATES.COMPLETED,
    retryable: false,
  });
  publishStates.set(fingerprint, legState);

  if (deps.savePublishedNewsLink) {
    deps.savePublishedNewsLink(sourceLink, `${dbTitle} ${message}`);
  }

  updateBaselineAfterPublish(candidate.post);

  return {
    published: true,
    state: legState.state,
    fingerprint,
    sourceLink,
    resolvedTitle: validation.resolvedTitle,
    messageLength: message.length,
    telegramSent: true,
    dbInserted: true,
    telegramMessageId: legState.telegramMessageId,
    sitePostId: legState.sitePostId,
    legState,
  };
}

async function retryPublishLeg(candidate, legState, ctx = {}, deps = {}) {
  const retryLeg = resolveRetryLeg(legState);
  if (!retryLeg) {
    return { skipped: true, reason: "nothing_to_retry", legState };
  }

  const validation = validateCandidateForAtomicPublish(candidate, ctx);
  const message = validation.sanitizedMessage || candidate.formattedMessage;
  const dbTitle = validation.resolvedTitle || candidate.facts?.title || "خبر سوق";
  const sourceLink = legState.sourceLink;
  const impactLevel = candidate.newsType === "economic" ? "HIGH" : "MEDIUM";

  let nextState = { ...legState };

  if ((retryLeg === "telegram_only" || retryLeg === "full") && !legState.telegramSent) {
    if (deps.deliverTelegramNews) {
      await deps.deliverTelegramNews({ message, candidate, dryRun: deps.dryRun });
    } else {
      await deps.sendTelegramMessage(message);
    }
    nextState = transitionPublishLegState(nextState, { telegramSent: true, state: PUBLISH_STATES.TELEGRAM_PUBLISHED });
  }

  if ((retryLeg === "site_only" || retryLeg === "full") && !legState.siteInserted) {
    const saveResult = await deps.saveNewsPostToSupabase({
      title: dbTitle,
      content: message,
      image_url: null,
      impact_level: impactLevel,
      source_link: sourceLink,
    });
    if (saveResult?.error) {
      return {
        partial: true,
        reason: "db_insert_failed",
        retryLeg,
        legState: transitionPublishLegState(nextState, {
          retryable: true,
          reason: "db_insert_failed",
          state: PUBLISH_STATES.TELEGRAM_PUBLISHED,
        }),
      };
    }
    nextState = transitionPublishLegState(nextState, {
      siteInserted: true,
      sitePostId: saveResult?.id || null,
      state: PUBLISH_STATES.COMPLETED,
    });
  }

  publishStates.set(legState.fingerprint, nextState);
  return { published: nextState.state === PUBLISH_STATES.COMPLETED, retryLeg, legState: nextState };
}

function resetAtomicPublishForTests() {
  memoryReservations.clear();
  publishStates.clear();
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
  getPublishStateForFingerprint,
  releaseMemoryReservation,
  isFingerprintAlreadyPublished,
};
