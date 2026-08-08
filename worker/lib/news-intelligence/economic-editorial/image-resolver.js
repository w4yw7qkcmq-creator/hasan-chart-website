const { logPhase2Event, PHASE2_EVENTS } = require("./observability-v2");
const { decideImageRequirement, VISUAL_PRIORITY } = require("./image-decision");

async function resolvePublicationImage(editorialContext = {}, options = {}) {
  const startedAt = Date.now();
  const decision = decideImageRequirement({
    eventType: editorialContext.eventType,
    eventFamily: editorialContext.eventFamily,
    importance: editorialContext.importance,
  });

  if (decision.level === VISUAL_PRIORITY.NONE) {
    return {
      ok: true,
      required: false,
      image: null,
      meta: { source: "none", latencyMs: Date.now() - startedAt },
    };
  }

  if (decision.level === VISUAL_PRIORITY.REQUIRED) {
    logPhase2Event(PHASE2_EVENTS.IMAGE_REQUIRED, {
      eventType: editorialContext.eventType,
      eventFamily: editorialContext.eventFamily,
    });
  }

  if (options.sourceImageUrl && options.allowSourceImage !== false) {
    logPhase2Event(PHASE2_EVENTS.IMAGE_SELECTED, { source: "external" });
    return {
      ok: true,
      required: decision.level === VISUAL_PRIORITY.REQUIRED,
      image: options.sourceImageUrl,
      imageUrl: options.sourceImageUrl,
      meta: { source: "external", latencyMs: Date.now() - startedAt },
    };
  }

  if (typeof options.createCategoryVisual === "function") {
    try {
      const visual = await options.createCategoryVisual(editorialContext);
      if (visual?.path || visual?.url) {
        logPhase2Event(PHASE2_EVENTS.IMAGE_SELECTED, { source: "category_template" });
        return {
          ok: true,
          required: decision.level === VISUAL_PRIORITY.REQUIRED,
          image: visual.path || null,
          imageUrl: visual.url || null,
          meta: { source: "category_template", latencyMs: Date.now() - startedAt },
        };
      }
    } catch {
      // fall through to branded fallback
    }
  }

  if (typeof options.createBrandedFallback === "function") {
    try {
      const fallback = await options.createBrandedFallback(editorialContext);
      if (fallback?.path || fallback?.url) {
        logPhase2Event(PHASE2_EVENTS.IMAGE_FALLBACK_USED, { source: "branded_fallback" });
        return {
          ok: true,
          required: decision.level === VISUAL_PRIORITY.REQUIRED,
          image: fallback.path || null,
          imageUrl: fallback.url || null,
          meta: { source: "branded_fallback", latencyMs: Date.now() - startedAt },
        };
      }
    } catch {
      // continue
    }
  }

  if (options.testMode === true || options.allowPlaceholderImage === true) {
    logPhase2Event(PHASE2_EVENTS.IMAGE_FALLBACK_USED, { source: "test_placeholder" });
    return {
      ok: true,
      required: decision.level === VISUAL_PRIORITY.REQUIRED,
      image: null,
      imageUrl: "phase2://placeholder-visual",
      meta: { source: "test_placeholder", latencyMs: Date.now() - startedAt, placeholder: true },
    };
  }

  if (decision.level === VISUAL_PRIORITY.REQUIRED) {
    logPhase2Event(PHASE2_EVENTS.IMAGE_REQUIRED_UNAVAILABLE, {
      eventType: editorialContext.eventType,
    });
    return {
      ok: false,
      reason: "IMAGE_REQUIRED_UNAVAILABLE",
      required: true,
    };
  }

  return {
    ok: true,
    required: false,
    image: null,
    meta: { source: "optional_missing", latencyMs: Date.now() - startedAt },
  };
}

module.exports = {
  resolvePublicationImage,
};
