const { TEXT_FREE_DIRECTIVE, NEGATIVE_PROMPT } = require("../editorial-intelligence/config/visual-rules");
const { buildReleaseSeed, hashSeed } = require("../fallback-visual-themes");
const {
  ONE_PHOTOGRAPH_RULE,
  ANTI_AI_RULE_LIST,
  DOCUMENTARY_REALISM_RULES,
  PROMPT_OPENING,
} = require("./photojournalism-rules");

function buildReleaseVariation(profile = {}) {
  const seed = hashSeed(buildReleaseSeed(profile));
  const releaseDate = profile.releaseTime ? new Date(profile.releaseTime).toISOString().slice(0, 10) : "unknown";
  return `unique editorial treatment for release on ${releaseDate}, composition variant ${seed % 997}, diversity key ${profile.consistencyKey || seed % 997}`;
}

function buildPhotojournalismPrompt({
  photoStory = {},
  cameraPlan = {},
  visualScene = {},
  artDirection = {},
  editorialConsistency = {},
  profile = {},
} = {}) {
  const forbidden = [
    ...new Set([
      ...(visualScene.forbiddenSubjects || artDirection.forbiddenSubjects || []),
      ...(editorialConsistency.globalEditorialAvoid || []),
    ]),
  ];
  const heroSubject = photoStory.heroSubject || artDirection.heroSubject;
  const globalStyle = editorialConsistency.globalEditorialStyle || [];

  const positiveParts = [
    PROMPT_OPENING,
    photoStory.displayTitle ? `Event mood: ${photoStory.displayTitle}.` : null,
    visualScene.geography?.country ? `Country context: ${visualScene.geography.country}.` : null,
    visualScene.geography?.institution ? `Institution context: ${visualScene.geography.institution}.` : null,
    photoStory.sceneVariantId ? `Scene variant: ${photoStory.sceneVariantId}.` : null,
    `Photo story: ${photoStory.visualStory}`,
    `Photographer intent: ${photoStory.photographerIntent}`,
    `Moment before: ${photoStory.momentBefore}`,
    `Moment after: ${photoStory.momentAfter}`,
    `Subject behavior: ${photoStory.subjectBehavior}`,
    `Background behavior: ${photoStory.backgroundBehavior}`,
    `Environment behavior: ${photoStory.environmentBehavior}`,
    cameraPlan.cameraType ? `Camera language: ${cameraPlan.cameraType}.` : null,
    cameraPlan.cameraLanguageDescription ? `Camera language notes: ${cameraPlan.cameraLanguageDescription}.` : null,
    `Camera position: ${cameraPlan.cameraPosition}.`,
    `Camera distance: ${cameraPlan.cameraDistance}.`,
    `Camera height: ${cameraPlan.cameraHeight}.`,
    `Camera angle: ${cameraPlan.cameraAngle}.`,
    `Lens: ${cameraPlan.lens}.`,
    `Depth of field: ${cameraPlan.depthOfField}.`,
    `Focus plane: ${cameraPlan.focusPlane || photoStory.focusPriority}.`,
    cameraPlan.compositionStyle ? `Composition style: ${cameraPlan.compositionStyle}.` : null,
    cameraPlan.ruleOfThirds ? `Rule of thirds: ${cameraPlan.ruleOfThirds}.` : null,
    cameraPlan.negativeSpace ? `Negative space: ${cameraPlan.negativeSpace}.` : null,
    `Framing: ${cameraPlan.framing || "Single-frame photojournalism composition"}.`,
    `Documentary realism rules: ${DOCUMENTARY_REALISM_RULES.join("; ")}.`,
    globalStyle.length ? `Global editorial style: ${globalStyle.join("; ")}.` : null,
    ONE_PHOTOGRAPH_RULE,
    editorialConsistency.consistencyKey ? `Editorial consistency key: ${editorialConsistency.consistencyKey}.` : null,
    `Art direction hero subject: ${heroSubject}.`,
    (artDirection.supportingSubjects || []).length
      ? `Art direction supporting subjects (maximum two): ${artDirection.supportingSubjects.join("; ")}.`
      : null,
    `Art direction mood: ${artDirection.mood}.`,
    `Art direction composition: ${artDirection.composition}.`,
    `Lighting: ${cameraPlan.lighting || artDirection.lighting}.`,
    cameraPlan.negativeSpaceInstruction || visualScene.overlay?.negativeSpaceInstruction,
    buildReleaseVariation({ ...profile, consistencyKey: editorialConsistency.consistencyKey }),
  ].filter(Boolean);

  const avoidParts = [
    TEXT_FREE_DIRECTIVE,
    NEGATIVE_PROMPT,
    ...forbidden,
    ...ANTI_AI_RULE_LIST,
    "illustration style",
    "poster style",
    "marketing style",
    "concept art",
    "stock illustration",
    "3D render",
    "digital painting",
    "overcrowded scene",
    "multiple scenes in one frame",
    "Create cinematic scene",
    "dramatic orange teal grading",
    "cinematic movie look",
    "AI fantasy look",
  ];

  return `${positiveParts.join(" ")} Avoid: ${[...new Set(avoidParts)].join(", ")}.`
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  buildPhotojournalismPrompt,
  PROMPT_OPENING,
};
