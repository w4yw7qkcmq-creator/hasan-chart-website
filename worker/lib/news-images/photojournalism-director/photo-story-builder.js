const { resolvePhotoStoryTemplate } = require("./config/event-photo-stories");

function buildPhotoStory(profile = {}, entities = {}, artDirection = {}, composition = {}) {
  const template = resolvePhotoStoryTemplate(profile, artDirection);
  const personName = entities.person?.names?.[0] || null;

  let visualStory = template.visualStory;
  let photographerIntent = template.photographerIntent;
  if (personName && artDirection.primarySubjectType === "person") {
    visualStory = visualStory.replace(/Powell|president|speaker/gi, personName);
    photographerIntent = `${photographerIntent} Primary subject: ${personName}.`;
  }

  return {
    storyTitle: template.storyTitle,
    visualStory,
    photographerIntent,
    momentBefore: template.momentBefore,
    momentAfter: template.momentAfter,
    cameraPosition: null,
    cameraDistance: null,
    cameraHeight: null,
    lens: artDirection.lens || template.lens || "50mm",
    focusPriority: artDirection.heroSubject,
    subjectBehavior: template.subjectBehavior,
    backgroundBehavior: template.backgroundBehavior,
    environmentBehavior: template.environmentBehavior,
    documentaryStyle: template.documentaryStyle,
    eventKey: artDirection.eventKey,
    artDirectionGroup: artDirection.artDirectionGroup,
    displayTitle: artDirection.displayTitle || profile.displayTitle,
    heroSubject: artDirection.heroSubject,
    supportingSubjects: artDirection.supportingSubjects || [],
    overlayPlacement: composition.overlayPlacement || null,
  };
}

module.exports = {
  buildPhotoStory,
};
