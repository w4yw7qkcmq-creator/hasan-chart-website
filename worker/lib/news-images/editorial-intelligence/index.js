const { buildEditorialProfile, resolveImageDisplayTitle, normalizeEditorialContext } = require("./event-profiler");
const { resolveEntityBundle } = require("./entity-resolver");
const { resolveVisualSubjects } = require("./visual-subject-resolver");
const { resolveComposition } = require("./composition-resolver");
const { buildPromptSpec } = require("./prompt-spec-builder");
const { validatePromptSpec } = require("./prompt-validator");
const { listEditorialEventKeys, resolveEventDefinition } = require("./config/events");
const { PEOPLE } = require("./config/people");
const { INSTITUTIONS } = require("./config/institutions");
const { COUNTRIES } = require("./config/countries");
const { MARKETS } = require("./config/markets");
const {
  resolveEditorialArtDirection,
  buildVisualSceneDefinition,
} = require("../editorial-art-director");
const { resolvePhotojournalismDirection } = require("../photojournalism-director");
const { resolveEditorialConsistency } = require("../editorial-consistency-director");
const { resolveEditorialIdentity } = require("../editorial-identity-director");
const {
  resolveEditorialImageEligibility,
} = require("../editorial-identity-director/eligibility-gate");

function buildSkippedEditorialBundle(profile = {}, editorialIdentity = {}, context = {}) {
  return {
    skipped: true,
    premiumImageEligible: false,
    profile,
    entities: null,
    visualSubjects: null,
    composition: null,
    artDirection: null,
    photojournalism: null,
    photoStory: null,
    cameraPlan: null,
    editorialConsistency: null,
    editorialIdentity,
    visualScene: null,
    spec: null,
    validation: { ok: true, issues: [], skipped: true },
    prompt: null,
    displayTitle: profile.displayTitle,
    editorialSubtitle: null,
    headlineLines: [],
    overlayPlacement: null,
    visualCategory: null,
    seed: null,
    releaseSeed: null,
    promptSource: "editorial-identity-ineligible",
  };
}

function buildEditorialPromptBundle(context = {}) {
  const profile = buildEditorialProfile(context);

  if (!resolveEditorialImageEligibility(profile, context)) {
    const editorialIdentity = resolveEditorialIdentity(profile, {}, {}, {}, context);
    return buildSkippedEditorialBundle(profile, editorialIdentity, context);
  }

  const entities = resolveEntityBundle(profile);
  const visualSubjects = resolveVisualSubjects(profile, entities);
  const composition = resolveComposition(profile, visualSubjects);
  const artDirection = resolveEditorialArtDirection(profile, entities, visualSubjects, composition);
  const photojournalism = resolvePhotojournalismDirection(profile, entities, artDirection, composition);
  const editorialConsistency = resolveEditorialConsistency(
    profile,
    entities,
    artDirection,
    composition,
    photojournalism
  );
  const editorialIdentity = resolveEditorialIdentity(
    profile,
    entities,
    artDirection,
    editorialConsistency,
    context
  );
  const visualScene = buildVisualSceneDefinition(
    artDirection,
    profile,
    entities,
    composition,
    {
      photoStory: editorialConsistency.photoStory,
      cameraPlan: editorialConsistency.cameraPlan,
    },
    editorialConsistency
  );
  const spec = buildPromptSpec(profile, entities, visualSubjects, composition, context);
  const validation = validatePromptSpec(spec, profile, entities);

  return {
    profile,
    entities,
    visualSubjects,
    composition,
    artDirection,
    photojournalism,
    photoStory: editorialConsistency.photoStory,
    cameraPlan: editorialConsistency.cameraPlan,
    editorialConsistency,
    editorialIdentity,
    visualScene,
    spec,
    validation,
    prompt: spec.prompt,
    displayTitle: spec.displayTitle,
    editorialSubtitle: editorialIdentity.editorialSubtitle,
    headlineLines: editorialIdentity.headlineLines,
    overlayPlacement: spec.overlayPlacement,
    visualCategory: spec.visualCategory,
    seed: spec.seed,
    releaseSeed: spec.releaseSeed,
    promptSource: spec.promptSource,
  };
}

function resolveProductionImageProviderTarget() {
  return "openai";
}

function resolveEmergencyImageProvider() {
  return "fallback";
}

module.exports = {
  buildEditorialProfile,
  resolveImageDisplayTitle,
  normalizeEditorialContext,
  buildEditorialPromptBundle,
  listEditorialEventKeys,
  resolveEventDefinition,
  resolveProductionImageProviderTarget,
  resolveEmergencyImageProvider,
  counts: {
    events: listEditorialEventKeys().length,
    people: Object.keys(PEOPLE).length,
    institutions: Object.keys(INSTITUTIONS).length,
    countries: Object.keys(COUNTRIES).length,
    markets: Object.keys(MARKETS).length,
  },
};
