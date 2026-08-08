const { resolveVisualPriority, IMAGE_REQUIRED_EVENTS, getFamilyMetadata } = require("./interpretation-registry");

const VISUAL_PRIORITY = {
  REQUIRED: "REQUIRED",
  OPTIONAL: "OPTIONAL",
  NONE: "NONE",
};

function decideImageRequirement(context = {}) {
  const { eventType, eventFamily, importance } = context;
  if (eventFamily) {
    const familyMeta = getFamilyMetadata(eventFamily);
    if (familyMeta?.visualPriority) {
      return { level: familyMeta.visualPriority, reason: "family_policy" };
    }
  }

  const priority = resolveVisualPriority(eventType, eventFamily);
  if (priority === "REQUIRED" || IMAGE_REQUIRED_EVENTS.has(eventType)) {
    return { level: VISUAL_PRIORITY.REQUIRED, reason: "event_registry" };
  }

  if (importance === "HIGH" && IMAGE_REQUIRED_EVENTS.has(eventType)) {
    return { level: VISUAL_PRIORITY.REQUIRED, reason: "high_importance" };
  }

  if (priority === "NONE") {
    return { level: VISUAL_PRIORITY.NONE, reason: "policy_none" };
  }

  return { level: VISUAL_PRIORITY.OPTIONAL, reason: "default_optional" };
}

module.exports = {
  VISUAL_PRIORITY,
  decideImageRequirement,
};
