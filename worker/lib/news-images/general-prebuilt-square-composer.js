const { BRAND_NAME } = require("./composer");
const {
  CANVAS_SIZE,
  BRAND_COLORS,
  SQUARE_SAFE_ZONES,
  wrapDisplayTitle,
  inspectSquareBackgroundForTypography,
} = require("./economic-fast-lane-square-composer");

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildGeneralPrebuiltOverlaySvg(context = {}) {
  const displayTitle = String(context.displayTitle || "BREAKING NEWS").trim();
  const subtitle = String(context.subtitle || "ECONOMIC DEVELOPMENTS").trim();
  const categoryLabel = String(context.categoryLabel || "Breaking News").trim();
  const headlineLines = wrapDisplayTitle(displayTitle);
  const lineHeight = 54;
  const titleStartY = 900 - (headlineLines.length - 1) * lineHeight;
  const dividerY = titleStartY + headlineLines.length * lineHeight + 18;
  const subtitleY = dividerY + 34;

  const headlineTspans = headlineLines
    .map((line, index) => {
      return `<tspan x="60" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="brandFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0.16)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </linearGradient>
        <linearGradient id="titleFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.22)"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${CANVAS_SIZE}" height="200" fill="url(#brandFade)"/>
      <rect x="0" y="820" width="${CANVAS_SIZE}" height="260" fill="url(#titleFade)"/>
      <rect x="48" y="48" width="72" height="72" rx="14" fill="${BRAND_COLORS.badgeFill}" stroke="${BRAND_COLORS.badgeStroke}" stroke-width="2"/>
      <text x="84" y="92" text-anchor="middle" fill="${BRAND_COLORS.gold}" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">EN</text>
      <text x="135" y="78" fill="${BRAND_COLORS.white}" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeXml(BRAND_NAME)}</text>
      <text x="135" y="106" fill="${BRAND_COLORS.whiteSoft}" font-size="16" font-family="Arial, Helvetica, sans-serif">${escapeXml(categoryLabel)}</text>
      <text x="60" y="${titleStartY}" fill="${BRAND_COLORS.white}" font-size="46" font-family="Arial, Helvetica, sans-serif" font-weight="700" stroke="${BRAND_COLORS.titleShadow}" stroke-width="2" paint-order="stroke">${headlineTspans}</text>
      <line x1="60" y1="${dividerY}" x2="420" y2="${dividerY}" stroke="${BRAND_COLORS.gold}" stroke-width="2" opacity="0.9"/>
      <text x="60" y="${subtitleY}" fill="${BRAND_COLORS.goldSoft}" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="600">${escapeXml(subtitle)}</text>
    </svg>`;
}

async function composeGeneralPrebuiltArtwork(backgroundBuffer, context = {}, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  if (!backgroundBuffer?.length) {
    throw new Error("composeGeneralPrebuiltArtwork requires a background buffer");
  }

  const normalizedBackground = await sharp(backgroundBuffer)
    .rotate()
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const overlaySvg = buildGeneralPrebuiltOverlaySvg(context);
  const composed = await sharp(normalizedBackground)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return {
    buffer: composed,
    overlaySvg,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    brandName: BRAND_NAME,
    displayTitle: String(context.displayTitle || "").trim(),
    subtitle: String(context.subtitle || "").trim(),
    categoryLabel: String(context.categoryLabel || "Breaking News").trim(),
  };
}

module.exports = {
  CANVAS_SIZE,
  BRAND_NAME,
  buildGeneralPrebuiltOverlaySvg,
  composeGeneralPrebuiltArtwork,
  inspectSquareBackgroundForTypography,
};
