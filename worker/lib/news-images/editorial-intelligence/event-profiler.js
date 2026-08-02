const { resolveEventDefinition } = require("./config/events");
const { DISPLAY_TITLE_OVERRIDES } = require("./config/visual-rules");

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeEditorialContext(context = {}) {
  return {
    canonicalEventKey: normalizeKey(context.canonicalEventKey || context.eventKey),
    eventName: String(context.eventName || context.title || "").trim(),
    title: String(context.title || context.eventName || "").trim(),
    summary: String(context.summary || "").trim(),
    sourceText: String(context.sourceText || "").trim(),
    country: normalizeKey(context.country || "US"),
    institution: context.institution ? normalizeKey(context.institution) : null,
    person: context.person ? String(context.person).trim() : null,
    releaseTime: context.releaseTime || null,
    period: context.period || null,
    importance: context.importance || "high",
    previous: context.previous ?? null,
    forecast: context.forecast ?? null,
    actual: context.actual ?? null,
  };
}

function buildEditorialProfile(context = {}) {
  const normalized = normalizeEditorialContext(context);
  const eventDef = resolveEventDefinition(normalized.canonicalEventKey);

  return {
    ...normalized,
    eventDefinition: eventDef,
    eventCategory: eventDef?.category || "macro",
    importance: normalized.importance || "high",
    hasStructuredResults: Boolean(normalized.previous || normalized.forecast || normalized.actual),
    displayTitle: resolveImageDisplayTitle(normalized),
  };
}

function resolveImageDisplayTitle(context = {}) {
  const key = normalizeKey(context.canonicalEventKey || context.eventKey);
  if (DISPLAY_TITLE_OVERRIDES[key]) {
    return DISPLAY_TITLE_OVERRIDES[key];
  }
  const eventDef = resolveEventDefinition(key);
  if (eventDef?.displayName) {
    return shortenTitle(eventDef.displayName).toUpperCase();
  }
  return shortenTitle(context.eventName || context.title || "Macro Release").toUpperCase();
}

function shortenTitle(title) {
  const text = String(title || "").trim();
  if (text.length <= 34) {
    return text;
  }
  return text.slice(0, 31).trim() + "...";
}

module.exports = {
  normalizeEditorialContext,
  buildEditorialProfile,
  resolveImageDisplayTitle,
};
