const { NEWS_EVENTS, logNewsEvent } = require("./observability");
const { PUBLICATION_TYPES, DESTINATIONS, SOURCE_TYPES } = require("./publication-types");
const { buildCanonicalEventFromCandidate, isNumericEconomicRelease } = require("./event-normalizer");
const { validateEditorialOutput, validateFactIntegrity, BLOCK_REASONS: EDITORIAL_BLOCK_REASONS } = require("./editorial-guards");
const { validateNumericEconomicSourcePolicy, BLOCK_REASONS: SOURCE_BLOCK_REASONS } = require("./source-policy");
const {
  createPublicationStore,
  LEG_STATUS,
  BLOCK_REASONS: STORE_BLOCK_REASONS,
} = require("./publication-store");
const { allowMemoryIdempotencyFallback, isProductionRuntime } = require("./runtime-mode");
const { evaluateCopySimilarity } = require("./copy-similarity-guard");
const { extractFactsFromTelegramPost } = require("../telegram-news/extractor");
const { validateAndRepairPublicationSemantics } = require("./editorial-repair");
const { BLOCK_REASONS: SEMANTIC_BLOCK_REASONS } = require("./semantic-publication-validation");
const phase3 = (() => {
  try {
    return require("./autonomy/integration");
  } catch {
    return null;
  }
})();

const BLOCK_REASONS = {
  ...EDITORIAL_BLOCK_REASONS,
  ...SOURCE_BLOCK_REASONS,
  ...STORE_BLOCK_REASONS,
  ...SEMANTIC_BLOCK_REASONS,
};

function resolveDestination(publication) {
  if (publication.destination) {
    return publication.destination;
  }
  return DESTINATIONS.BOTH;
}

function shouldDeliverTelegram(destination) {
  return destination === DESTINATIONS.TELEGRAM || destination === DESTINATIONS.BOTH;
}

function shouldDeliverSite(destination) {
  return destination === DESTINATIONS.SITE || destination === DESTINATIONS.BOTH;
}

function buildStoredPublicationMetadata(publication, editorial, canonical) {
  return {
    ...(publication.metadata || {}),
    title: publication.title,
    body: editorial.body,
    bodySource: publication.bodySource || "formatted",
    sourceLink: publication.sourceLink || null,
    importance: publication.importance || "HIGH",
    facts: publication.facts || {},
    eventType: canonical.eventType,
    eventKey: canonical.eventKey,
    image: publication.image || null,
    imageUrl: publication.imageUrl || null,
    imageResult: publication.imageResult || null,
    imagePolicy: publication.imagePolicy || null,
    imageStatus: publication.metadata?.imageStatus || null,
    imageTelemetry: publication.metadata?.imageTelemetry || null,
  };
}

async function attachPublicationImageResult(publication, deps = {}) {
  if (publication.imageResult?.generationAttempted) {
    return publication;
  }
  if (typeof deps.resolvePublicationImageResult !== "function") {
    return publication;
  }

  const imageResolution = await deps.resolvePublicationImageResult(publication, deps);
  return {
    ...publication,
    imagePolicy: imageResolution.policy?.mode || publication.imagePolicy || null,
    imageResult: imageResolution.imageResult || null,
    imageUrl: imageResolution.imageResult?.imageUrl || publication.imageUrl || null,
    image: imageResolution.imageResult?.filePath || publication.image || null,
    metadata: {
      ...(publication.metadata || {}),
      imageTelemetry: imageResolution.telemetry || null,
      imageStatus: imageResolution.imageStatus || null,
    },
  };
}

function createNewsPublisherGateway(options = {}) {
  const store = createPublicationStore(options);

  async function deliverPublicationLegs(publication, editorial, canonical, publicationRecord, deps = {}) {
    const destination = resolveDestination(publication);
    let telegramSent = publicationRecord.telegramLegStatus === LEG_STATUS.SUCCESS;
    let siteInserted = publicationRecord.siteLegStatus === LEG_STATUS.SUCCESS;
    const imageResult = publication.imageResult || null;
    const photoPath = imageResult?.filePath || publication.image || null;
    const siteImageUrl = imageResult?.imageUrl || publication.imageUrl || null;

    if (shouldDeliverTelegram(destination) && publicationRecord.telegramLegStatus !== LEG_STATUS.SUCCESS) {
      try {
        if (photoPath && deps.sendTelegramPhoto) {
          await deps.sendTelegramPhoto(editorial.body, photoPath);
          telegramSent = true;
        } else if (deps.sendTelegramMessage) {
          const delivery = await deps.sendTelegramMessage(editorial.body);
          telegramSent = delivery?.ok !== false;
        }
        await store.updateDeliveryLeg(
          publicationRecord,
          "telegram",
          telegramSent ? LEG_STATUS.SUCCESS : LEG_STATUS.FAILED
        );
      } catch (error) {
        if (deps.sendTelegramMessage) {
          await deps.sendTelegramMessage(editorial.body);
          telegramSent = true;
          await store.updateDeliveryLeg(publicationRecord, "telegram", LEG_STATUS.SUCCESS);
        } else {
          await store.updateDeliveryLeg(publicationRecord, "telegram", LEG_STATUS.FAILED);
          throw error;
        }
      }
    }

    if (shouldDeliverSite(destination) && publicationRecord.siteLegStatus !== LEG_STATUS.SUCCESS) {
      if (deps.saveNewsPostToSupabase) {
        const saveResult = await deps.saveNewsPostToSupabase({
          title: publication.title,
          content: editorial.body,
          image_url: siteImageUrl || null,
          impact_level: publication.importance || "HIGH",
          source_link: publication.sourceLink || canonical.eventKey,
        });
        siteInserted = !saveResult?.error;
        await store.updateDeliveryLeg(
          publicationRecord,
          "site",
          siteInserted ? LEG_STATUS.SUCCESS : LEG_STATUS.FAILED
        );
      }
    }

    if (deps.savePublishedNewsToSupabase && publication.sourceLink) {
      await deps.savePublishedNewsToSupabase({
        link: publication.sourceLink,
        title: `${publication.title} ${editorial.body}`.slice(0, 500),
        normalized_title: publication.title.slice(0, 500),
        topic_cluster: canonical.eventKey || publication.eventKey || null,
        published_at: new Date().toISOString(),
      });
    }

    if (deps.savePublishedNewsLink && publication.sourceLink) {
      deps.savePublishedNewsLink(publication.sourceLink, `${publication.title} ${editorial.body}`);
    }

    if (deps.dispatchMarketNewsNotifications) {
      await deps.dispatchMarketNewsNotifications({
        title: publication.title,
        sourceLink: publication.sourceLink,
        impactLevel: publication.importance || "HIGH",
      });
    }

    return { telegramSent, siteInserted };
  }

  async function evaluatePublication(publication, options = {}) {
    logNewsEvent(NEWS_EVENTS.CANDIDATE_RECEIVED, {
      eventType: publication.eventType || null,
      sourceType: publication.sourceType || null,
      publicationType: publication.publicationType || PUBLICATION_TYPES.GENERAL_NEWS,
      destination: resolveDestination(publication),
    });

    const editorial = validateEditorialOutput(publication);
    if (!editorial.ok) {
      logNewsEvent(NEWS_EVENTS.RAW_FALLBACK_BLOCKED, {
        reason: editorial.reason,
        sourceType: publication.sourceType,
      });
      return { blocked: true, reason: editorial.reason, stage: "editorial" };
    }

    const canonical = buildCanonicalEventFromCandidate({
      eventType: publication.eventType,
      country: publication.country,
      releaseDate: publication.releaseDate,
      scheduledAt: publication.releaseDate,
      sourcePublishedAt: publication.releaseDate,
      receivedAt: publication.receivedAt,
      actual: publication.facts?.actual,
      forecast: publication.facts?.forecast,
      previous: publication.facts?.previous,
      unit: publication.facts?.unit,
      sourceChannel: publication.sourceId,
      rawMessageId: publication.metadata?.rawMessageId,
      rawText: publication.rawSourceText,
      title: publication.title,
    });

    if (canonical.eventKey) {
      logNewsEvent(NEWS_EVENTS.EVENT_NORMALIZED, {
        eventKey: canonical.eventKey,
        eventType: canonical.eventType,
        eventFamily: canonical.eventFamily,
      });
    }

    if (publication.familyPublicationKey) {
      canonical.eventKey = publication.familyPublicationKey;
    }

    const numericEconomic = isNumericEconomicRelease(canonical.eventType || publication.eventType);
    const publicationType = publication.publicationType || PUBLICATION_TYPES.GENERAL_NEWS;

    const sourcePolicy = validateNumericEconomicSourcePolicy({
      eventType: canonical.eventType || publication.eventType,
      sourceType: publication.sourceType,
      sourceId: publication.sourceId,
      publicationType,
    });
    if (!sourcePolicy.ok) {
      logNewsEvent(NEWS_EVENTS.PUBLICATION_FAILED, {
        reason: sourcePolicy.reason,
        eventKey: canonical.eventKey,
        sourceType: publication.sourceType,
        sourceId: publication.sourceId,
      });
      return { blocked: true, reason: sourcePolicy.reason, stage: "source_policy", detail: sourcePolicy.detail };
    }

    if (publication.rawSourceText) {
      const copyCheck = evaluateCopySimilarity(editorial.body, publication.rawSourceText, publication.copyGuard);
      if (!copyCheck.ok) {
        logNewsEvent(NEWS_EVENTS.COPY_SIMILARITY_BLOCKED, {
          reason: copyCheck.reason,
          similarity: copyCheck.similarity,
          eventKey: canonical.eventKey,
        });
        return { blocked: true, reason: copyCheck.reason, stage: "copy_similarity", copyCheck };
      }
    }

    if (numericEconomic && publication.facts) {
      const bodyFacts = extractFactsFromTelegramPost({ rawText: editorial.body });
      const factCheck = validateFactIntegrity(publication.facts, {
        actual: bodyFacts.actual,
        forecast: bodyFacts.forecast,
        previous: bodyFacts.previous,
      });
      if (!factCheck.ok) {
        logNewsEvent(NEWS_EVENTS.FACT_INTEGRITY_BLOCKED, {
          reason: factCheck.reason,
          mismatches: factCheck.mismatches,
          eventKey: canonical.eventKey,
        });
        return { blocked: true, reason: factCheck.reason, stage: "fact_integrity", factCheck };
      }
    }

    return {
      allowed: true,
      editorial,
      canonical,
      numericEconomic,
      publicationType,
    };
  }

  async function publish(publication, deps = {}) {
    const ingestStartedAt = Date.now();
    const correlationId = phase3?.observeCandidateReceived(publication, deps) || publication.correlationId;
    const publicationWithCorrelation = correlationId
      ? { ...publication, correlationId }
      : publication;

    const evaluation = await evaluatePublication(publicationWithCorrelation, deps);
    if (evaluation.blocked) {
      phase3?.observeEvaluationBlocked(publicationWithCorrelation, evaluation, {
        ...deps,
        correlationId,
        latency: { totalMs: Date.now() - ingestStartedAt },
      });
      return evaluation;
    }

    const quarantine = phase3?.checkSourceQuarantine(publicationWithCorrelation, deps);
    if (quarantine && !quarantine.allowed) {
      const blocked = {
        blocked: true,
        reason: quarantine.reason,
        stage: "source_quarantine",
      };
      phase3?.observeEvaluationBlocked(publicationWithCorrelation, blocked, {
        ...deps,
        correlationId,
        latency: { totalMs: Date.now() - ingestStartedAt },
      });
      return blocked;
    }

    const { editorial, canonical, numericEconomic, publicationType } = evaluation;
    const destination = resolveDestination(publication);
    let publicationRecord = null;

    let publicationForSemantics = publicationWithCorrelation;
    let editorialForDelivery = editorial;

    if (publicationType === PUBLICATION_TYPES.GENERAL_NEWS && !numericEconomic) {
      const semanticResult = validateAndRepairPublicationSemantics(
        publicationWithCorrelation,
        editorial,
        deps
      );
      if (!semanticResult.ok) {
        const blocked = {
          blocked: true,
          reason: semanticResult.reason || BLOCK_REASONS.SEMANTIC_PUBLICATION_INVALID,
          stage: semanticResult.stage || "semantic_validation",
          validation: semanticResult.validation || null,
        };
        phase3?.observeEvaluationBlocked(publicationWithCorrelation, blocked, {
          ...deps,
          correlationId,
          latency: { totalMs: Date.now() - ingestStartedAt },
        });
        return blocked;
      }
      publicationForSemantics = semanticResult.publication;
      editorialForDelivery = semanticResult.editorial;
    }

    if (numericEconomic && publicationType === PUBLICATION_TYPES.RELEASE && canonical.eventKey) {
      const identity = await store.acquirePublicationIdentity({
        eventKey: canonical.eventKey,
        publicationType,
        sourceType: publication.sourceType,
        sourceId: publication.sourceId,
        metadata: buildStoredPublicationMetadata(publicationForSemantics, editorialForDelivery, canonical),
      });

      if (!identity.acquired) {
        if (identity.reason === BLOCK_REASONS.IDEMPOTENCY_STORE_UNAVAILABLE) {
          logNewsEvent(NEWS_EVENTS.PUBLICATION_FAILED, {
            reason: identity.reason,
            eventKey: canonical.eventKey,
            detail: identity.detail,
          });
          const blocked = {
            blocked: true,
            reason: identity.reason,
            stage: "idempotency",
            eventKey: canonical.eventKey,
            detail: identity.detail,
          };
          phase3?.observeEvaluationBlocked(publicationWithCorrelation, blocked, {
            ...deps,
            correlationId,
            latency: { totalMs: Date.now() - ingestStartedAt },
          });
          return blocked;
        }

        logNewsEvent(NEWS_EVENTS.DUPLICATE_BLOCKED, {
          reason: identity.reason || BLOCK_REASONS.DUPLICATE_BLOCKED,
          eventKey: canonical.eventKey,
          publicationType,
          destination,
        });
        const duplicateBlocked = {
          blocked: true,
          reason: identity.reason || BLOCK_REASONS.DUPLICATE_BLOCKED,
          stage: "idempotency",
          eventKey: canonical.eventKey,
          publicationRecord: identity.record || null,
        };
        phase3?.observeEvaluationBlocked(publicationWithCorrelation, duplicateBlocked, {
          ...deps,
          correlationId,
          latency: { totalMs: Date.now() - ingestStartedAt },
        });
        return duplicateBlocked;
      }

      publicationRecord = identity.record;
      logNewsEvent(NEWS_EVENTS.LOCK_ACQUIRED, {
        eventKey: canonical.eventKey,
        publicationType,
        destination,
        dbBacked: identity.dbBacked === true,
        memoryOnly: identity.memoryOnly === true,
      });
    }

    logNewsEvent(NEWS_EVENTS.PUBLICATION_ALLOWED, {
      eventKey: canonical.eventKey,
      eventType: canonical.eventType,
      publicationType,
      destination,
      sourceType: publication.sourceType,
    });

    if (deps.dryRun) {
      if (publicationRecord?.eventKey) {
        await store.updateDeliveryLeg(publicationRecord, "telegram", LEG_STATUS.SKIPPED);
        await store.updateDeliveryLeg(publicationRecord, "site", LEG_STATUS.SKIPPED);
        publicationRecord.telegramLegStatus = LEG_STATUS.SKIPPED;
        publicationRecord.siteLegStatus = LEG_STATUS.SKIPPED;
      }
      const dryRunResult = {
        dryRun: true,
        published: true,
        eventKey: canonical.eventKey,
        canonical,
        message: editorialForDelivery.body,
        publicationRecord,
      };
      phase3?.observePublicationResult(publicationForSemantics, dryRunResult, {
        ...deps,
        correlationId,
        latency: { totalMs: Date.now() - ingestStartedAt },
      });
      return dryRunResult;
    }

    try {
      if (!publicationRecord && numericEconomic && publicationType === PUBLICATION_TYPES.RELEASE) {
        const blocked = {
          blocked: true,
          reason: BLOCK_REASONS.IDEMPOTENCY_STORE_UNAVAILABLE,
          stage: "idempotency",
          eventKey: canonical.eventKey,
        };
        phase3?.observeEvaluationBlocked(publicationWithCorrelation, blocked, {
          ...deps,
          correlationId,
          latency: { totalMs: Date.now() - ingestStartedAt },
        });
        return blocked;
      }

      if (!publicationRecord) {
        publicationRecord = {
          eventKey: canonical.eventKey || publication.sourceLink || null,
          publicationType,
          sourceType: publication.sourceType,
          sourceId: publication.sourceId,
          telegramLegStatus: LEG_STATUS.PENDING,
          siteLegStatus: LEG_STATUS.PENDING,
          metadata: buildStoredPublicationMetadata(publication, editorial, canonical),
        };
      }

      const publicationForDelivery = await attachPublicationImageResult(
        {
          ...publicationForSemantics,
          eventKey: canonical.eventKey || publication.eventKey || null,
          eventType: publication.eventType || canonical.eventType || null,
          importance: publication.importance || "HIGH",
        },
        deps
      );
      publicationRecord.metadata = buildStoredPublicationMetadata(
        publicationForDelivery,
        editorialForDelivery,
        canonical
      );

      const delivery = await deliverPublicationLegs(
        publicationForDelivery,
        editorialForDelivery,
        canonical,
        publicationRecord,
        deps
      );
      await store.updateDeliveryLeg(
        publicationRecord,
        "telegram",
        delivery.telegramSent ? LEG_STATUS.SUCCESS : LEG_STATUS.FAILED
      );
      await store.updateDeliveryLeg(
        publicationRecord,
        "site",
        delivery.siteInserted ? LEG_STATUS.SUCCESS : LEG_STATUS.FAILED
      );
      publicationRecord.telegramLegStatus = delivery.telegramSent ? LEG_STATUS.SUCCESS : LEG_STATUS.FAILED;
      publicationRecord.siteLegStatus = delivery.siteInserted ? LEG_STATUS.SUCCESS : LEG_STATUS.FAILED;

      logNewsEvent(NEWS_EVENTS.PUBLICATION_SUCCESS, {
        eventKey: canonical.eventKey,
        telegramSent: delivery.telegramSent,
        siteInserted: delivery.siteInserted,
      });

      const successResult = {
        published: delivery.telegramSent && delivery.siteInserted,
        partial: delivery.telegramSent && !delivery.siteInserted,
        eventKey: canonical.eventKey,
        canonical,
        telegramSent: delivery.telegramSent,
        siteInserted: delivery.siteInserted,
        publicationRecord,
        editorial: editorialForDelivery,
      };
      phase3?.observePublicationResult(publicationForDelivery, successResult, {
        ...deps,
        correlationId,
        gateway: { retryDelivery },
        latency: { totalMs: Date.now() - ingestStartedAt },
      });
      return successResult;
    } catch (error) {
      logNewsEvent(NEWS_EVENTS.PUBLICATION_FAILED, {
        eventKey: canonical.eventKey,
        reason: error.message,
      });
      const failedResult = {
        failed: true,
        reason: error.message,
        eventKey: canonical.eventKey,
        publicationRecord,
        editorial,
        partial: publicationRecord?.telegramLegStatus === LEG_STATUS.SUCCESS,
        telegramSent: publicationRecord?.telegramLegStatus === LEG_STATUS.SUCCESS,
        siteInserted: publicationRecord?.siteLegStatus === LEG_STATUS.SUCCESS,
      };
      phase3?.observePublicationResult(publicationWithCorrelation, failedResult, {
        ...deps,
        correlationId,
        gateway: { retryDelivery },
        latency: { totalMs: Date.now() - ingestStartedAt },
      });
      return failedResult;
    }
  }

  async function retryDelivery(publicationRecord, options = {}, deps = {}) {
    if (!publicationRecord?.eventKey || !publicationRecord?.publicationType) {
      return { blocked: true, reason: "RETRY_PUBLICATION_RECORD_MISSING", stage: "retry" };
    }

    const stored = publicationRecord.metadata || {};
    const publication = {
      eventType: stored.eventType,
      eventKey: publicationRecord.eventKey,
      publicationType: publicationRecord.publicationType,
      sourceType: publicationRecord.sourceType,
      sourceId: publicationRecord.sourceId,
      title: stored.title,
      body: stored.body,
      bodySource: stored.bodySource || "formatted",
      destination: options.destination || DESTINATIONS.BOTH,
      sourceLink: stored.sourceLink,
      importance: stored.importance || "HIGH",
      facts: stored.facts || {},
      image: stored.image || null,
      imageUrl: stored.imageUrl || null,
      imageResult: stored.imageResult || null,
      imagePolicy: stored.imagePolicy || null,
      metadata: stored,
    };

    const editorial = { ok: true, body: publication.body, title: publication.title };
    const canonical = buildCanonicalEventFromCandidate({
      eventType: stored.eventType,
      releaseDate: stored.releaseDate,
      actual: stored.facts?.actual,
      forecast: stored.facts?.forecast,
      previous: stored.facts?.previous,
      title: stored.title,
    });

    const retryLeg = options.retryLeg || "full";
    const workingRecord = {
      ...publicationRecord,
      telegramLegStatus:
        retryLeg === "site_only" || options.skipTelegram === true
          ? publicationRecord.telegramLegStatus
          : publicationRecord.telegramLegStatus,
      siteLegStatus:
        retryLeg === "telegram_only" || options.skipSite === true
          ? publicationRecord.siteLegStatus
          : publicationRecord.siteLegStatus,
    };

    if (retryLeg === "telegram_only") {
      workingRecord.siteLegStatus = LEG_STATUS.SUCCESS;
    }
    if (retryLeg === "site_only") {
      workingRecord.telegramLegStatus = LEG_STATUS.SUCCESS;
    }

    if (deps.dryRun) {
      return { dryRun: true, retried: true, publicationRecord: workingRecord, retryLeg };
    }

    try {
      const delivery = await deliverPublicationLegs(publication, editorial, canonical, workingRecord, deps);
      return {
        retried: true,
        published: delivery.telegramSent && delivery.siteInserted,
        partial: delivery.telegramSent && !delivery.siteInserted,
        telegramSent: delivery.telegramSent,
        siteInserted: delivery.siteInserted,
        publicationRecord: workingRecord,
        retryLeg,
      };
    } catch (error) {
      return {
        failed: true,
        reason: error.message,
        publicationRecord: workingRecord,
        retryLeg,
        partial: workingRecord.telegramLegStatus === LEG_STATUS.SUCCESS,
        telegramSent: workingRecord.telegramLegStatus === LEG_STATUS.SUCCESS,
        siteInserted: workingRecord.siteLegStatus === LEG_STATUS.SUCCESS,
      };
    }
  }

  return {
    publish,
    retryDelivery,
    evaluatePublication,
    store,
  };
}

module.exports = {
  createNewsPublisherGateway,
  BLOCK_REASONS,
  PUBLICATION_TYPES,
  DESTINATIONS,
  SOURCE_TYPES,
  allowMemoryIdempotencyFallback,
  isProductionRuntime,
};
