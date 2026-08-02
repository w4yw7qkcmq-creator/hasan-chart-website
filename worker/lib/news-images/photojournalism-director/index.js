const { buildPhotoStory } = require("./photo-story-builder");
const { resolveCameraDirection } = require("./camera-director");
const { buildPhotojournalismPrompt, PROMPT_OPENING } = require("./photojournalism-prompt-builder");
const {
  ONE_PHOTOGRAPH_RULE,
  ANTI_AI_RULES,
  ANTI_AI_RULE_LIST,
  DOCUMENTARY_REALISM_RULES,
} = require("./photojournalism-rules");

function resolvePhotojournalismDirection(profile = {}, entities = {}, artDirection = {}, composition = {}) {
  const photoStory = buildPhotoStory(profile, entities, artDirection, composition);
  const cameraPlan = resolveCameraDirection(photoStory, artDirection, composition);
  return {
    photoStory: {
      ...photoStory,
      cameraPosition: cameraPlan.cameraPosition,
      cameraDistance: cameraPlan.cameraDistance,
      cameraHeight: cameraPlan.cameraHeight,
      lens: cameraPlan.lens,
      focusPriority: photoStory.focusPriority || artDirection.heroSubject,
    },
    cameraPlan,
  };
}

module.exports = {
  buildPhotoStory,
  resolveCameraDirection,
  resolvePhotojournalismDirection,
  buildPhotojournalismPrompt,
  PROMPT_OPENING,
  ONE_PHOTOGRAPH_RULE,
  ANTI_AI_RULES,
  ANTI_AI_RULE_LIST,
  DOCUMENTARY_REALISM_RULES,
};
