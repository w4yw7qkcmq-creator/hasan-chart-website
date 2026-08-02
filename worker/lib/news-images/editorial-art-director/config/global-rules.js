const GLOBAL_CLUTTER_RULES = [
  "no more than one hero subject",
  "maximum two supporting subjects",
  "no more than one screen",
  "no more than one chart",
  "no more than one building",
  "no more than one flag",
  "if hero is a person, no large institutional building as co-hero",
  "if hero is a building, no large person as co-hero",
  "do not cram every event symbol into one frame",
];

const GLOBAL_FORBIDDEN_SUBJECTS = [
  "multiple focal points",
  "AI-looking composition",
  "marketing style",
  "advertisement style",
  "stock illustration style",
  "3D render",
  "concept art",
  "digital painting",
  "overcrowded scene",
  "cinematic movie poster look",
  "visual clutter",
];

const PHOTOGRAPHY_DIRECTIVES = [
  "Shot on professional full-frame camera",
  "Natural documentary lighting",
  "Editorial newspaper photography",
  "Authentic location",
  "Minimal composition",
  "Single hero subject",
  "No visual clutter",
  "Photographic realism",
  "Documentary photography feel",
];

const PROMPT_OPENING = "Create a realistic editorial financial news photograph.";

module.exports = {
  GLOBAL_CLUTTER_RULES,
  GLOBAL_FORBIDDEN_SUBJECTS,
  PHOTOGRAPHY_DIRECTIVES,
  PROMPT_OPENING,
};
