const { validateFinalEditorialQuality } = require("./editorial-quality");
const { validateFinalMessageAgainstFacts } = require("./invariants");
const { isGenericTitle, normalizeTitleText } = require("./editorial-title");
const { sanitizeChannelArtifacts, assertNoChannelArtifacts } = require("./channel-sanitizer");
const { buildPublishFingerprintBundle } = require("./semantic-fingerprints");
const { isSourcePublishable, updateBaselineAfterPublish } = require("./publish-state");
const { buildPremiumImageContextFromCandidate } = require("../news-images/important-events");

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
  const state = publishStates.get(fingerprint) || { state: "reserved" };

  if (deps.dryRun) {
    publishStates.set(fingerprint, { state: "completed", telegramSent: true, dbInserted: true, dryRun: true });
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
      if (delivery?.delivery === "dry_run") {
        state.telegramSent = true;
        state.state = "telegram_sent";
        publishStates.set(fingerprint, state);
      } else {
        state.telegramSent = true;
        state.state = "telegram_sent";
        state.premiumImage = delivery?.premiumImage === true;
        publishStates.set(fingerprint, state);
      }
    } else {
      await deps.sendTelegramMessage(message);
      state.telegramSent = true;
      state.state = "telegram_sent";
      publishStates.set(fingerprint, state);
    }
  } catch (error) {
    state.state = "failed";
    publishStates.set(fingerprint, state);
    releaseMemoryReservation(fingerprint);
    return { failed: true, state: "failed", reason: error.message, fingerprint };
  }

  const sourceLink =
    candidate.post?.sourceUrl || `telegram:${candidate.post?.sourceChannel}/${candidate.post?.sourceMessageId}`;
  state.sourceLink = sourceLink;
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
  }

  const saveResult = await deps.saveNewsPostToSupabase({
    title: dbTitle,
    content: message,
    image_url: null,
    impact_level: impactLevel,
    source_link: sourceLink,
  });

  if (saveResult?.error) {
    state.state = "telegram_sent";
    state.dbInserted = false;
    publishStates.set(fingerprint, state);
    return {
      partial: true,
      state: "telegram_sent",
      reason: "db_insert_failed",
      fingerprint,
      telegramSent: true,
      dbInserted: false,
    };
  }

  state.dbInserted = true;
  state.state = "completed";
  publishStates.set(fingerprint, state);

  if (deps.savePublishedNewsLink) {
    deps.savePublishedNewsLink(sourceLink, `${dbTitle} ${message}`);
  }

  updateBaselineAfterPublish(candidate.post);

  return {
    published: true,
    state: "completed",
    fingerprint,
    sourceLink,
    resolvedTitle: validation.resolvedTitle,
    messageLength: message.length,
    telegramSent: true,
    dbInserted: true,
  };
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
  extractResolvedTitle,
  resetAtomicPublishForTests,
  getPublishStateForFingerprint,
  releaseMemoryReservation,
  isFingerprintAlreadyPublished,
};
