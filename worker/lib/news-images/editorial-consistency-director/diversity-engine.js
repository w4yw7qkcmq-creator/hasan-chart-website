const { buildReleaseSeed, hashSeed, createSeededRandom } = require("../fallback-visual-themes");
const { SCENE_VARIANTS, resolveSceneVariantGroup } = require("./config/scene-variants");
const { COMPOSITION_VARIANTS } = require("./config/composition-variants");
const { resolveCameraLanguage } = require("./config/camera-language");

function buildDiversitySeed(profile = {}) {
  return hashSeed(buildReleaseSeed(profile));
}

function pickVariantIndex(seed, variantCount, salt = 0) {
  const rand = createSeededRandom(seed + salt);
  return Math.floor(rand() * variantCount);
}

function resolveDiversityPlan(profile = {}, artDirection = {}) {
  const seed = buildDiversitySeed(profile);
  const sceneGroup = resolveSceneVariantGroup(profile, artDirection);
  const sceneVariants = SCENE_VARIANTS[sceneGroup] || SCENE_VARIANTS.DEFAULT;
  const sceneVariantIndex = pickVariantIndex(seed, sceneVariants.length, 11);
  const compositionVariantIndex = pickVariantIndex(seed, COMPOSITION_VARIANTS.length, 29);
  const cameraAngleVariantIndex = pickVariantIndex(seed, 3, 47);

  const cameraAngleVariants = [
    "slightly left of center documentary angle",
    "straight-on documentary angle",
    "slightly right of center documentary angle",
  ];

  return {
    seed,
    releaseSeed: buildReleaseSeed(profile),
    sceneGroup,
    sceneVariantIndex,
    sceneVariant: sceneVariants[sceneVariantIndex],
    compositionVariant: COMPOSITION_VARIANTS[compositionVariantIndex],
    cameraAngleVariant: cameraAngleVariants[cameraAngleVariantIndex],
    diversityKey: `${sceneGroup}|scene:${sceneVariantIndex}|comp:${compositionVariantIndex}|cam:${cameraAngleVariantIndex}`,
  };
}

function applySceneVariant(photoStory = {}, diversityPlan = {}) {
  const variant = diversityPlan.sceneVariant;
  if (!variant) {
    return photoStory;
  }
  return {
    ...photoStory,
    sceneVariantId: variant.id,
    heroSubject: variant.heroSubject,
    visualStory: variant.visualStory,
    momentBefore: variant.momentBefore,
    momentAfter: variant.momentAfter,
    focusPriority: variant.heroSubject,
  };
}

function applyCameraLanguage(cameraPlan = {}, cameraLanguage = {}, diversityPlan = {}) {
  return {
    ...cameraPlan,
    cameraLanguageKey: cameraLanguage.key,
    cameraType: cameraLanguage.cameraType,
    lens: cameraLanguage.lens,
    depthOfField: cameraLanguage.depthOfField,
    cameraHeight: cameraLanguage.cameraHeight,
    cameraDistance: cameraLanguage.cameraDistance,
    cameraAngle: diversityPlan.cameraAngleVariant || cameraLanguage.cameraAngle,
    cameraLanguageDescription: cameraLanguage.description,
  };
}

function applyCompositionVariant(cameraPlan = {}, compositionVariant = {}) {
  return {
    ...cameraPlan,
    compositionVariantId: compositionVariant.id,
    heroPosition: compositionVariant.heroPosition,
    compositionStyle: compositionVariant.compositionStyle,
    framing: compositionVariant.framing,
    ruleOfThirds: compositionVariant.ruleOfThirds,
    negativeSpace: compositionVariant.negativeSpace,
  };
}

module.exports = {
  buildDiversitySeed,
  resolveDiversityPlan,
  applySceneVariant,
  applyCameraLanguage,
  applyCompositionVariant,
  resolveCameraLanguage,
};
