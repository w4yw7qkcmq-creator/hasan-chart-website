function buildVisualSceneDefinition(
  artDirection = {},
  profile = {},
  entities = {},
  composition = {},
  photojournalism = {},
  editorialConsistency = {}
) {
  const { photoStory = {}, cameraPlan = {} } = photojournalism;

  return {
    eventKey: artDirection.eventKey,
    displayTitle: artDirection.displayTitle || profile.displayTitle,
    artDirectionGroup: artDirection.artDirectionGroup,
    sceneIntent:
      "The photograph should feel like it was captured for a major financial newspaper. It conveys the feeling of the event, it does not explain the headline.",
    heroSubject: photoStory.heroSubject || artDirection.heroSubject,
    supportingSubjects: artDirection.supportingSubjects || [],
    forbiddenSubjects: artDirection.forbiddenSubjects || [],
    photoStory,
    cameraPlan,
    editorialConsistency: editorialConsistency.consistencyKey
      ? {
          consistencyKey: editorialConsistency.consistencyKey,
          sceneVariantId: photoStory.sceneVariantId,
          compositionVariantId: photoStory.compositionVariantId,
          cameraLanguageKey: photoStory.cameraLanguageKey,
          cameraType: photoStory.cameraType,
        }
      : null,
    camera: {
      direction: cameraPlan.direction || artDirection.cameraDirection,
      lens: cameraPlan.lens || artDirection.lens,
      depthOfField: cameraPlan.depthOfField || artDirection.depthOfField,
      position: cameraPlan.cameraPosition,
      distance: cameraPlan.cameraDistance,
      height: cameraPlan.cameraHeight,
      angle: cameraPlan.cameraAngle,
      focusPlane: cameraPlan.focusPlane,
      framing: cameraPlan.framing,
      cameraType: cameraPlan.cameraType,
      compositionStyle: cameraPlan.compositionStyle,
    },
    lighting: cameraPlan.lighting || artDirection.lighting,
    mood: artDirection.mood,
    composition: artDirection.composition,
    realismLevel: artDirection.realismLevel,
    editorialNotes: artDirection.editorialNotes,
    overlay: {
      placement: composition.overlayPlacement,
      brandPlacement: composition.brandPlacement,
      titlePlacement: composition.titlePlacement,
      negativeSpaceInstruction: composition.negativeSpaceInstruction,
    },
    geography: {
      country: artDirection.country,
      institution: artDirection.institution,
    },
    primarySubjectType: artDirection.primarySubjectType,
  };
}

module.exports = {
  buildVisualSceneDefinition,
};
