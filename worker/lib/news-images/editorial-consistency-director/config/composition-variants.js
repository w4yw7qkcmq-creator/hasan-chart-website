const COMPOSITION_VARIANTS = [
  {
    id: "left-composition",
    heroPosition: "left",
    compositionStyle: "left composition with hero subject on the left side of frame",
    framing: "Hero anchored on the left with open negative space on the right for overlay safety",
    ruleOfThirds: "subject placed on left vertical third",
    negativeSpace: "right-side negative space preserved for headline-safe zones",
  },
  {
    id: "right-composition",
    heroPosition: "right",
    compositionStyle: "right composition with hero subject on the right side of frame",
    framing: "Hero anchored on the right with open negative space on the left for overlay safety",
    ruleOfThirds: "subject placed on right vertical third",
    negativeSpace: "left-side negative space preserved for brand and headline-safe zones",
  },
  {
    id: "center-composition",
    heroPosition: "center",
    compositionStyle: "center composition with one hero subject in the central band of the frame",
    framing: "Single centered hero with balanced negative space above and below overlay zones",
    ruleOfThirds: "central subject with breathing room on both sides",
    negativeSpace: "upper-left and lower overlay zones kept clean",
  },
  {
    id: "rule-of-thirds-left",
    heroPosition: "left-third",
    compositionStyle: "rule of thirds composition with hero on the left third intersection",
    framing: "Classic rule-of-thirds framing with hero on left third and environmental context on the right",
    ruleOfThirds: "hero placed on left third intersection",
    negativeSpace: "clean overlay-safe zones preserved in upper-left and lower frame",
  },
  {
    id: "rule-of-thirds-right",
    heroPosition: "right-third",
    compositionStyle: "rule of thirds composition with hero on the right third intersection",
    framing: "Classic rule-of-thirds framing with hero on right third and environmental context on the left",
    ruleOfThirds: "hero placed on right third intersection",
    negativeSpace: "clean overlay-safe zones preserved in upper-left and lower frame",
  },
  {
    id: "negative-space-composition",
    heroPosition: "offset",
    compositionStyle: "negative space composition with hero offset to preserve overlay-safe areas",
    framing: "Hero offset to one side with deliberate negative space for editorial overlay",
    ruleOfThirds: "hero offset with strong negative space block",
    negativeSpace: "generous negative space for brand and headline overlay without black plates",
  },
];

module.exports = {
  COMPOSITION_VARIANTS,
};
