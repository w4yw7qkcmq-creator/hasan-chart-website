const { OVERLAY_PLACEMENTS } = require("./config/visual-rules");
const { resolveSafeZones, resolveSafeZonePromptInstruction } = require("../overlay-safe-zones");
const { hashSeed, createSeededRandom, buildReleaseSeed } = require("../fallback-visual-themes");

const PLACEMENTS = ["overlay-top-left", "overlay-top-right", "overlay-lower-left", "overlay-lower-center"];

function resolveComposition(profile = {}, visualSubjects = {}) {
  const preferred = profile.eventDefinition?.overlayPlacement || profile.eventDefinition?.compositionPreference || "overlay-top-left";
  const seed = hashSeed(buildReleaseSeed(profile));
  const rand = createSeededRandom(seed);
  const fallback = PLACEMENTS[Math.floor(rand() * PLACEMENTS.length)];
  const overlayPlacement = PLACEMENTS.includes(preferred) ? preferred : fallback;
  const titlePlacement = overlayPlacement === "overlay-top-left" ? "overlay-lower-center" : overlayPlacement;
  const safeZones = resolveSafeZones({
    brandPlacement: "overlay-top-left",
    titlePlacement,
  });

  return {
    overlayPlacement,
    brandPlacement: safeZones.brandPlacement,
    titlePlacement: safeZones.titlePlacement,
    brandSafeZone: safeZones.brandSafeZone,
    titleSafeZone: safeZones.titleSafeZone,
    negativeSpaceInstruction: [
      OVERLAY_PLACEMENTS[overlayPlacement] || OVERLAY_PLACEMENTS["overlay-top-left"],
      resolveSafeZonePromptInstruction(safeZones),
    ].join(" "),
    primarySubjectType: visualSubjects.primarySubjectType || "institution",
  };
}

module.exports = {
  resolveComposition,
};
