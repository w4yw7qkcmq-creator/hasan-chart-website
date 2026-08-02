const { WIDTH, HEIGHT } = require("./fallback-visual-themes");

const BRAND_SAFE_ZONE = {
  id: "brandSafeZone",
  placement: "overlay-top-left",
  x: 0,
  y: 0,
  width: 520,
  height: 190,
};

const TITLE_SAFE_ZONES = {
  "overlay-lower-left": {
    id: "titleSafeZone",
    placement: "overlay-lower-left",
    x: 0,
    y: 430,
    width: 700,
    height: 245,
  },
  "overlay-lower-center": {
    id: "titleSafeZone",
    placement: "overlay-lower-center",
    x: 0,
    y: 430,
    width: WIDTH,
    height: 245,
  },
  "overlay-top-right": {
    id: "titleSafeZone",
    placement: "overlay-top-right",
    x: 520,
    y: 430,
    width: 680,
    height: 245,
  },
  "overlay-top-left": {
    id: "titleSafeZone",
    placement: "overlay-lower-center",
    x: 0,
    y: 430,
    width: WIDTH,
    height: 245,
  },
};

function resolveSafeZones(overlayLayout = {}) {
  const titlePlacement = overlayLayout.titlePlacement || overlayLayout.titleSafeZone || "overlay-lower-center";
  const titleSafeZone = TITLE_SAFE_ZONES[titlePlacement] || TITLE_SAFE_ZONES["overlay-lower-center"];

  return {
    brandSafeZone: { ...BRAND_SAFE_ZONE },
    titleSafeZone: { ...titleSafeZone },
    brandPlacement: overlayLayout.brandPlacement || "overlay-top-left",
    titlePlacement,
  };
}

function resolveSafeZonePromptInstruction(safeZones = {}) {
  const brand = safeZones.brandSafeZone;
  const title = safeZones.titleSafeZone;
  return [
    `Keep the upper-left brand-safe area completely empty: x=${brand.x}-${brand.x + brand.width}, y=${brand.y}-${brand.y + brand.height}.`,
    `Keep the title-safe area completely empty: x=${title.x}-${title.x + title.width}, y=${title.y}-${title.y + title.height}.`,
    "These zones must contain no letters, words, captions, typography, numbers, labels, signs, posters, banners, or readable screens.",
  ].join(" ");
}

module.exports = {
  WIDTH,
  HEIGHT,
  BRAND_SAFE_ZONE,
  TITLE_SAFE_ZONES,
  resolveSafeZones,
  resolveSafeZonePromptInstruction,
};
