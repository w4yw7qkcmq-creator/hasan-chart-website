const { GLOBAL_EDITORIAL_STYLE, GLOBAL_EDITORIAL_AVOID } = require("./global-editorial-style");
const {
  resolveDiversityPlan,
  applySceneVariant,
  applyCameraLanguage,
  applyCompositionVariant,
  resolveCameraLanguage,
} = require("./diversity-engine");

function resolveEditorialConsistency(profile = {}, entities = {}, artDirection = {}, composition = {}, photojournalism = {}) {
  const diversityPlan = resolveDiversityPlan(profile, artDirection);
  const cameraLanguage = resolveCameraLanguage(profile, artDirection, entities);

  const enrichedPhotoStory = applySceneVariant(photojournalism.photoStory || {}, diversityPlan);
  let enrichedCameraPlan = applyCameraLanguage(
    photojournalism.cameraPlan || {},
    cameraLanguage,
    diversityPlan
  );
  enrichedCameraPlan = applyCompositionVariant(enrichedCameraPlan, diversityPlan.compositionVariant);

  return {
    photoStory: {
      ...enrichedPhotoStory,
      sceneVariantId: diversityPlan.sceneVariant?.id || null,
      sceneGroup: diversityPlan.sceneGroup,
      compositionVariantId: diversityPlan.compositionVariant?.id || null,
      cameraLanguageKey: cameraLanguage.key,
      cameraType: cameraLanguage.cameraType,
    },
    cameraPlan: enrichedCameraPlan,
    diversityPlan,
    cameraLanguage,
    compositionVariant: diversityPlan.compositionVariant,
    globalEditorialStyle: GLOBAL_EDITORIAL_STYLE,
    globalEditorialAvoid: GLOBAL_EDITORIAL_AVOID,
    consistencyKey: diversityPlan.diversityKey,
  };
}

module.exports = {
  resolveEditorialConsistency,
  GLOBAL_EDITORIAL_STYLE,
  GLOBAL_EDITORIAL_AVOID,
};
