const { TEXT_FREE_DIRECTIVE, NEGATIVE_PROMPT } = require("../editorial-intelligence/config/visual-rules");
const { buildReleaseSeed, hashSeed } = require("../fallback-visual-themes");
const {
  PROMPT_OPENING,
  PHOTOGRAPHY_DIRECTIVES,
  GLOBAL_FORBIDDEN_SUBJECTS,
} = require("./config/global-rules");

function buildReleaseVariation(profile = {}) {
  const seed = hashSeed(buildReleaseSeed(profile));
  const releaseDate = profile.releaseTime ? new Date(profile.releaseTime).toISOString().slice(0, 10) : "unknown";
  return `unique editorial treatment for release on ${releaseDate}, composition variant ${seed % 997}`;
}

function buildArtDirectedPrompt(visualScene = {}, profile = {}) {
  const supporting = (visualScene.supportingSubjects || []).slice(0, 2);
  const forbidden = [...new Set([...(visualScene.forbiddenSubjects || []), ...GLOBAL_FORBIDDEN_SUBJECTS])];

  const positiveParts = [
    PROMPT_OPENING,
    visualScene.displayTitle ? `Event mood: ${visualScene.displayTitle}.` : null,
    visualScene.geography?.country ? `Country context: ${visualScene.geography.country}.` : null,
    visualScene.geography?.institution ? `Institution context: ${visualScene.geography.institution}.` : null,
    `Hero subject: ${visualScene.heroSubject}.`,
    supporting.length ? `Supporting subjects (maximum two): ${supporting.join("; ")}.` : "Supporting subjects: none.",
    ...PHOTOGRAPHY_DIRECTIVES.map((line) => `${line}.`),
    `Camera direction: ${visualScene.camera?.direction}.`,
    `Lens: ${visualScene.camera?.lens}.`,
    `Depth of field: ${visualScene.camera?.depthOfField}.`,
    `Lighting: ${visualScene.lighting}.`,
    `Mood: ${visualScene.mood}.`,
    `Composition: ${visualScene.composition}.`,
    `Realism level: ${visualScene.realismLevel}.`,
    visualScene.editorialNotes ? `Editorial notes: ${visualScene.editorialNotes}.` : null,
    visualScene.sceneIntent,
    visualScene.overlay?.negativeSpaceInstruction,
    buildReleaseVariation(profile),
  ].filter(Boolean);

  const avoidParts = [
    TEXT_FREE_DIRECTIVE,
    NEGATIVE_PROMPT,
    ...forbidden,
    "AI-looking composition",
    "multiple focal points",
    "marketing style",
    "advertisement style",
    "stock illustration style",
    "3D render",
    "concept art",
    "digital painting",
    "overcrowded scene",
    "Create cinematic scene",
    "concept art look",
  ];

  return `${positiveParts.join(" ")} Avoid: ${[...new Set(avoidParts)].join(", ")}.`
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  buildArtDirectedPrompt,
  PROMPT_OPENING,
};
