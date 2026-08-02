const { resolveVisualCategory, buildReleaseSeed, hashSeed } = require("../fallback-visual-themes");
const {
  resolveEditorialArtDirection,
  buildVisualSceneDefinition,
} = require("../editorial-art-director");
const { resolvePhotojournalismDirection } = require("../photojournalism-director");
const { resolveEditorialConsistency } = require("../editorial-consistency-director");
const { resolveEditorialIdentity, appendIdentityToPrompt } = require("../editorial-identity-director");
const { buildPhotojournalismPrompt } = require("../photojournalism-director/photojournalism-prompt-builder");

function buildReleaseVariation(profile = {}) {
  const seed = hashSeed(buildReleaseSeed(profile));
  const releaseDate = profile.releaseTime ? new Date(profile.releaseTime).toISOString().slice(0, 10) : "unknown";
  return `unique editorial treatment for release on ${releaseDate}, composition variant ${seed % 997}`;
}

function buildPromptSpec(profile = {}, entities = {}, visualSubjects = {}, composition = {}, context = {}) {
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
  const basePrompt = buildPhotojournalismPrompt({
    photoStory: editorialConsistency.photoStory,
    cameraPlan: editorialConsistency.cameraPlan,
    visualScene,
    artDirection: {
      ...artDirection,
      heroSubject: editorialConsistency.photoStory.heroSubject || artDirection.heroSubject,
    },
    editorialConsistency,
    profile,
  });
  const prompt = appendIdentityToPrompt(basePrompt, editorialIdentity, profile);

  return {
    prompt,
    displayTitle: profile.displayTitle,
    overlayPlacement: composition.overlayPlacement,
    brandPlacement: composition.brandPlacement,
    titlePlacement: composition.titlePlacement,
    visualCategory: resolveVisualCategory(profile.canonicalEventKey || profile.eventKey),
    primarySubjectType: artDirection.primarySubjectType,
    seed: hashSeed(buildReleaseSeed(profile)),
    releaseSeed: buildReleaseSeed(profile),
    personId: entities.person?.id || null,
    institutionId: entities.institution?.id || null,
    countryId: entities.country?.id || null,
    marketIds: (entities.markets || []).map((market) => market.id),
    forbiddenElements: artDirection.forbiddenSubjects,
    artDirection,
    photoStory: editorialConsistency.photoStory,
    cameraPlan: editorialConsistency.cameraPlan,
    editorialConsistency,
    editorialIdentity,
    visualScene,
    promptSource: "editorial-identity-director",
  };
}

module.exports = {
  buildPromptSpec,
  buildReleaseVariation,
};
