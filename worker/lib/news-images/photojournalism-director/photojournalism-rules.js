const ONE_PHOTOGRAPH_RULE = [
  "The image must look like it was captured in a single shutter press",
  "One scene only",
  "One hero only",
  "One story only",
  "If the image needs more than one scene to be understood, it is wrong",
  "No city plus chart plus store plus flag plus screen in one frame",
].join(". ");

const ANTI_AI_RULES = {
  NO_AI_COLLAGE: "no AI collage or stitched multi-scene composition",
  NO_MARKETING_LOOK: "no marketing look or advertisement styling",
  NO_CONCEPT_ART: "no concept art or illustration styling",
  NO_STOCK_PHOTO_STYLE: "no stock photo staging or forced smiles",
  NO_SYMBOL_COLLECTION: "no symbol collection or macro icon stacking",
  NO_MULTIPLE_FOCAL_POINTS: "no multiple competing focal points",
  NO_EXCESSIVE_VISUAL_ELEMENTS: "no excessive visual elements or clutter",
};

const ANTI_AI_RULE_LIST = Object.values(ANTI_AI_RULES);

const DOCUMENTARY_REALISM_RULES = [
  "Documentary photojournalism realism",
  "Natural unposed behavior",
  "Subjects not looking at the camera unless press-event context requires it",
  "Authentic location and lighting",
  "Physically plausible scene",
  "Looks like a real assignment photograph not AI generation",
  "Not an illustration",
  "Not a poster",
  "Not marketing",
  "Not concept art",
];

const PROMPT_OPENING =
  "Create a realistic editorial news photograph captured by a professional financial photojournalist.";

module.exports = {
  ONE_PHOTOGRAPH_RULE,
  ANTI_AI_RULES,
  ANTI_AI_RULE_LIST,
  DOCUMENTARY_REALISM_RULES,
  PROMPT_OPENING,
};
