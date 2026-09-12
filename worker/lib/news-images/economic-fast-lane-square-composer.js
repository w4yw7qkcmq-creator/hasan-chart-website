const { BRAND_NAME } = require("./composer");

const CANVAS_SIZE = 1080;

const BRAND_COLORS = {
  gold: "#F5D78E",
  goldSoft: "rgba(245, 215, 142, 0.82)",
  white: "#FFFFFF",
  whiteSoft: "rgba(255, 255, 255, 0.72)",
  badgeFill: "rgba(255, 255, 255, 0.08)",
  badgeStroke: "rgba(255, 210, 120, 0.55)",
  titleShadow: "rgba(0, 0, 0, 0.45)",
};

const SQUARE_SAFE_ZONES = {
  brand: { x: 0, y: 0, width: 520, height: 210 },
  title: { x: 0, y: 760, width: 900, height: 280 },
};

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapDisplayTitle(title = "", maxCharsPerLine = 22) {
  const words = String(title || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines.slice(0, 3);
}

function buildSquareOverlaySvg(context = {}) {
  const displayTitle = String(context.displayTitle || context.eventName || "MACRO RELEASE").trim();
  const subtitle = String(context.subtitle || "Macro Data").trim();
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
          <stop offset="0%" stop-color="rgba(0,0,0,0.28)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </linearGradient>
        <linearGradient id="titleFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${CANVAS_SIZE}" height="240" fill="url(#brandFade)"/>
      <rect x="0" y="760" width="${CANVAS_SIZE}" height="320" fill="url(#titleFade)"/>
      <rect x="48" y="48" width="72" height="72" rx="14" fill="${BRAND_COLORS.badgeFill}" stroke="${BRAND_COLORS.badgeStroke}" stroke-width="2"/>
      <text x="84" y="92" text-anchor="middle" fill="${BRAND_COLORS.gold}" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">EN</text>
      <text x="135" y="78" fill="${BRAND_COLORS.white}" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeXml(BRAND_NAME)}</text>
      <text x="135" y="106" fill="${BRAND_COLORS.whiteSoft}" font-size="16" font-family="Arial, Helvetica, sans-serif">Macro Data</text>
      <text x="60" y="${titleStartY}" fill="${BRAND_COLORS.white}" font-size="46" font-family="Arial, Helvetica, sans-serif" font-weight="700" stroke="${BRAND_COLORS.titleShadow}" stroke-width="2" paint-order="stroke">${headlineTspans}</text>
      <line x1="60" y1="${dividerY}" x2="420" y2="${dividerY}" stroke="${BRAND_COLORS.gold}" stroke-width="2" opacity="0.9"/>
      <text x="60" y="${subtitleY}" fill="${BRAND_COLORS.goldSoft}" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="600">${escapeXml(subtitle)}</text>
    </svg>`;
}

async function composeSquareArtwork(backgroundBuffer, context = {}, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  if (!backgroundBuffer?.length) {
    throw new Error("composeSquareArtwork requires a background buffer");
  }

  const normalizedBackground = await sharp(backgroundBuffer)
    .rotate()
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const overlaySvg = buildSquareOverlaySvg(context);
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
    subtitle: String(context.subtitle || "Macro Data").trim(),
  };
}

async function inspectSquareBackgroundForTypography(backgroundBuffer, options = {}) {
  const { analyzeTypographyBand, TYPOGRAPHY_REJECT_THRESHOLD } = require("./background-text-guard");

  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  const normalized = await sharp(backgroundBuffer)
    .rotate()
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const scanZones = [SQUARE_SAFE_ZONES.brand, SQUARE_SAFE_ZONES.title];
  const regions = [];

  for (const zone of scanZones) {
    const { data, info } = await sharp(normalized.data, {
      raw: {
        width: normalized.info.width,
        height: normalized.info.height,
        channels: normalized.info.channels,
      },
    })
      .extract({ left: zone.x, top: zone.y, width: zone.width, height: zone.height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const analysis = analyzeTypographyBand(data, info.width, info.height);
    if (analysis.typographyLikely) {
      regions.push({
        rect: zone,
        confidence: analysis.confidence,
        type: "probable_generated_typography",
      });
    }
  }

  const confidence = regions.length ? Math.max(...regions.map((region) => region.confidence)) : 0;
  const probableTextDetected = confidence >= TYPOGRAPHY_REJECT_THRESHOLD;

  return {
    probableTextDetected,
    confidence,
    regions,
    acceptedForComposition: !probableTextDetected,
    action: probableTextDetected ? "OPENAI_GENERATED_TYPOGRAPHY_REJECTED" : "compose_square_overlay",
    method: "square_visual_heuristic_only",
  };
}

module.exports = {
  CANVAS_SIZE,
  BRAND_COLORS,
  SQUARE_SAFE_ZONES,
  BRAND_NAME,
  buildSquareOverlaySvg,
  composeSquareArtwork,
  inspectSquareBackgroundForTypography,
  wrapDisplayTitle,
};
