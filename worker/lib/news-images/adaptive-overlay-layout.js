const { WIDTH, HEIGHT } = require("./fallback-visual-themes");
const { analyzeRawZone, loadRawImage, normalizeRect, rectsIntersect, luminance } = require("./background-text-guard");

const PLACEMENT_IDS = ["top-left", "top-right", "lower-left", "lower-right", "center-left", "center-right"];
const MIN_ACCEPTABLE_SCORE = 0.42;
const MAX_CROP_RATIO = 0.12;

const BRAND_CANDIDATES = {
  "top-left": {
    id: "top-left",
    zone: { x: 0, y: 0, width: 500, height: 150 },
    anchor: { x: 48, y: 42, badgeX: 83, badgeY: 86, nameX: 135, nameY: 74, subX: 135, subY: 99 },
    softGradient: { x: 0, y: 0, width: 360, height: 130, opacity: 0.17 },
  },
  "top-right": {
    id: "top-right",
    zone: { x: 700, y: 0, width: 500, height: 150 },
    anchor: { x: 720, y: 42, badgeX: 755, badgeY: 86, nameX: 807, nameY: 74, subX: 807, subY: 99 },
    softGradient: { x: 780, y: 0, width: 360, height: 130, opacity: 0.17 },
  },
};

const TITLE_CANDIDATES = {
  "lower-left": {
    id: "lower-left",
    zone: { x: 0, y: 470, width: 576, height: 205 },
    text: { x: 72, y: 540, anchor: "start", maxCharsPerLine: 18 },
    softGradient: { x: 24, y: 490, width: 540, height: 170, opacity: 0.13 },
  },
  "lower-right": {
    id: "lower-right",
    zone: { x: 624, y: 470, width: 576, height: 205 },
    text: { x: 1128, y: 540, anchor: "end", maxCharsPerLine: 18 },
    softGradient: { x: 636, y: 490, width: 540, height: 170, opacity: 0.13 },
  },
  "center-left": {
    id: "center-left",
    zone: { x: 48, y: 300, width: 576, height: 205 },
    text: { x: 96, y: 370, anchor: "start", maxCharsPerLine: 18 },
    softGradient: { x: 56, y: 320, width: 540, height: 170, opacity: 0.12 },
  },
  "center-right": {
    id: "center-right",
    zone: { x: 576, y: 300, width: 576, height: 205 },
    text: { x: 1104, y: 370, anchor: "end", maxCharsPerLine: 18 },
    softGradient: { x: 604, y: 320, width: 540, height: 170, opacity: 0.12 },
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function intersectionArea(a, b) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function isSkinTone(r, g, b) {
  return r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15;
}

async function extractZoneMetrics(sharp, buffer, rect) {
  const zone = normalizeRect(rect);
  const { data, info } = await sharp(buffer)
    .extract({ left: zone.x, top: zone.y, width: zone.width, height: zone.height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const typography = analyzeRawZone(data, info.width, info.height);
  let transitions = 0;
  let skinPixels = 0;
  const pixels = info.width * info.height;

  for (let y = 0; y < info.height; y += 1) {
    const rowOffset = y * info.width * 3;
    for (let x = 0; x < info.width; x += 1) {
      const idx = rowOffset + x * 3;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (isSkinTone(r, g, b)) {
        skinPixels += 1;
      }
      if (x > 0) {
        const prev = luminance(data[idx - 3], data[idx - 2], data[idx - 1]);
        const value = luminance(r, g, b);
        if (Math.abs(value - prev) >= 24) {
          transitions += 1;
        }
      }
    }
  }

  const edgeDensity = transitions / Math.max(1, pixels);
  const skinToneRatio = skinPixels / Math.max(1, pixels);
  const varianceScore = clamp(typography.confidence, 0, 1);

  return {
    rect: zone,
    typographyConfidence: varianceScore,
    edgeDensity: clamp(edgeDensity * 8, 0, 1),
    skinToneRatio: clamp(skinToneRatio * 18, 0, 1),
    emptySpaceScore: clamp(1 - edgeDensity * 5 - varianceScore * 0.45, 0, 1),
  };
}

async function detectProbableTextRegions(sharp, buffer) {
  const bands = [
    normalizeRect({ x: 0, y: 0, width: WIDTH, height: 190 }),
    normalizeRect({ x: 0, y: 430, width: WIDTH, height: 245 }),
    normalizeRect({ x: 120, y: 190, width: 960, height: 240 }),
    normalizeRect({ x: 0, y: 250, width: WIDTH, height: 200 }),
  ];

  const regions = [];
  for (const band of bands) {
    const metrics = await extractZoneMetrics(sharp, buffer, band);
    if (metrics.typographyConfidence >= 0.38) {
      regions.push({
        rect: band,
        confidence: metrics.typographyConfidence,
        type: "probable_typography",
      });
    }
  }

  return {
    probableTextRegions: regions,
    confidence: regions.length ? Math.max(...regions.map((region) => region.confidence)) : 0,
  };
}

async function detectSubjectHints(sharp, buffer, context = {}) {
  const centerZone = normalizeRect({ x: 320, y: 140, width: 560, height: 360 });
  const metrics = await extractZoneMetrics(sharp, buffer, centerZone);
  const subjectWeight = context.primarySubjectType === "person" ? 1.15 : 1;
  return {
    centerSubjectZone: centerZone,
    centerSaliency: clamp(metrics.edgeDensity * 0.7 + metrics.skinToneRatio * 0.5, 0, 1) * subjectWeight,
    skinToneRatio: metrics.skinToneRatio,
  };
}

function scoreCandidate(candidate, metrics, textRegions, subjectHints, preferenceBoost = 0, brandZone = null) {
  const zone = candidate.zone;
  const zoneArea = zone.width * zone.height;
  let textOverlap = 0;
  let subjectOverlap = 0;

  for (const region of textRegions) {
    textOverlap += intersectionArea(zone, region.rect) / Math.max(1, zoneArea);
  }

  const centerOverlap = intersectionArea(zone, subjectHints.centerSubjectZone) / Math.max(1, zoneArea);
  subjectOverlap = centerOverlap * subjectHints.centerSaliency;

  if (metrics.skinToneRatio > 0.08) {
    subjectOverlap += metrics.skinToneRatio * 0.8;
  }

  let brandOverlapPenalty = 0;
  if (brandZone) {
    brandOverlapPenalty = intersectionArea(zone, brandZone) / Math.max(1, zoneArea);
  }

  const score = clamp(
    metrics.emptySpaceScore * 0.34 +
      (1 - metrics.typographyConfidence) * 0.28 +
      (1 - metrics.edgeDensity) * 0.14 +
      (1 - textOverlap) * 0.18 +
      (1 - subjectOverlap) * 0.16 +
      (1 - brandOverlapPenalty) * 0.12 +
      preferenceBoost,
    0,
    1
  );

  return {
    id: candidate.id,
    score,
    textOverlapScore: textOverlap,
    subjectOverlapScore: subjectOverlap,
    emptySpaceScore: metrics.emptySpaceScore,
    typographyConfidence: metrics.typographyConfidence,
    reasons: [
      `empty=${metrics.emptySpaceScore.toFixed(2)}`,
      `textOverlap=${textOverlap.toFixed(2)}`,
      `subjectOverlap=${subjectOverlap.toFixed(2)}`,
      `typography=${metrics.typographyConfidence.toFixed(2)}`,
    ],
  };
}

function buildPreferenceBoost(id, preferred) {
  if (!preferred) {
    return 0;
  }
  if (id === preferred) {
    return 0.08;
  }
  return 0;
}

async function scorePlacements(sharp, buffer, context = {}) {
  const textScan = await detectProbableTextRegions(sharp, buffer);
  const subjectHints = await detectSubjectHints(sharp, buffer, context);
  const brandAlternatives = [];
  for (const candidate of Object.values(BRAND_CANDIDATES)) {
    const metrics = await extractZoneMetrics(sharp, buffer, candidate.zone);
    brandAlternatives.push(
      scoreCandidate(
        candidate,
        metrics,
        textScan.probableTextRegions,
        subjectHints,
        buildPreferenceBoost(candidate.id, context.preferredBrandPlacement || "top-left")
      )
    );
  }
  brandAlternatives.sort((a, b) => b.score - a.score);
  const selectedBrandCandidate = BRAND_CANDIDATES[brandAlternatives[0]?.id] || BRAND_CANDIDATES["top-left"];

  const alternatives = [];
  for (const candidate of Object.values(TITLE_CANDIDATES)) {
    const metrics = await extractZoneMetrics(sharp, buffer, candidate.zone);
    alternatives.push(
      scoreCandidate(
        candidate,
        metrics,
        textScan.probableTextRegions,
        subjectHints,
        buildPreferenceBoost(candidate.id, context.preferredTitlePlacement || context.titlePlacement),
        selectedBrandCandidate.zone
      )
    );
  }

  alternatives.sort((a, b) => b.score - a.score);

  return {
    textScan,
    subjectHints,
    titleAlternatives: alternatives,
    brandAlternatives,
    bestTitle: alternatives[0],
    bestBrand: brandAlternatives[0],
  };
}

function evaluateCropPlan(textRegions, subjectHints) {
  if (!textRegions.length) {
    return { ok: false, reason: "no_probable_text" };
  }

  const dominant = textRegions.reduce((best, region) => (region.confidence > best.confidence ? region : best), textRegions[0]);
  if (dominant.rect.y >= 220 && dominant.rect.y <= 420) {
    const cropTop = clamp(Math.floor(dominant.rect.y * 0.55), 0, Math.floor(HEIGHT * MAX_CROP_RATIO));
    if (cropTop > 0 && cropTop <= Math.floor(HEIGHT * MAX_CROP_RATIO)) {
      return { ok: true, cropTop, cropBottom: 0, reason: "shift_text_band_upward" };
    }
  }

  if (dominant.rect.y > 420) {
    const cropBottom = clamp(Math.floor((HEIGHT - dominant.rect.y) * 0.45), 0, Math.floor(HEIGHT * MAX_CROP_RATIO));
    if (cropBottom > 0) {
      return { ok: true, cropTop: 0, cropBottom, reason: "trim_lower_text_band" };
    }
  }

  if (subjectHints.centerSaliency > 0.72) {
    return { ok: false, reason: "crop_would_damage_primary_subject" };
  }

  return { ok: false, reason: "no_safe_crop" };
}

async function applyCropPlan(sharp, buffer, plan) {
  const metadata = await sharp(buffer).metadata();
  const sourceWidth = metadata.width || WIDTH;
  const sourceHeight = metadata.height || HEIGHT;
  const top = plan.cropTop || 0;
  const bottom = plan.cropBottom || 0;
  const extractHeight = sourceHeight - top - bottom;
  if (extractHeight < Math.floor(sourceHeight * (1 - MAX_CROP_RATIO * 2))) {
    return { ok: false, buffer };
  }

  const cropped = await sharp(buffer)
    .extract({ left: 0, top, width: sourceWidth, height: extractHeight })
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .png()
    .toBuffer();

  return { ok: true, buffer: cropped };
}

async function resolveAdaptiveLayout(backgroundBuffer, context = {}, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  let workingBuffer = backgroundBuffer;
  let cropApplied = false;
  let cropPlan = null;

  let scored = await scorePlacements(sharp, workingBuffer, context);
  let selectedTitle = scored.bestTitle;
  let selectedBrand = scored.bestBrand;

  if ((selectedTitle?.score || 0) < MIN_ACCEPTABLE_SCORE) {
    cropPlan = evaluateCropPlan(scored.textScan.probableTextRegions, scored.subjectHints);
    if (cropPlan.ok) {
      const cropped = await applyCropPlan(sharp, workingBuffer, cropPlan);
      if (cropped.ok) {
        workingBuffer = cropped.buffer;
        cropApplied = true;
        scored = await scorePlacements(sharp, workingBuffer, context);
        selectedTitle = scored.bestTitle;
        selectedBrand = scored.bestBrand;
      }
    }
  }

  const titlePlacement = TITLE_CANDIDATES[selectedTitle?.id] || TITLE_CANDIDATES["lower-right"];
  const brandPlacement = BRAND_CANDIDATES[selectedBrand?.id] || BRAND_CANDIDATES["top-left"];
  const requiresFallback = (selectedTitle?.score || 0) < MIN_ACCEPTABLE_SCORE;

  return {
    selectedTitlePlacement: titlePlacement.id,
    selectedBrandPlacement: brandPlacement.id,
    score: selectedTitle?.score || 0,
    brandScore: selectedBrand?.score || 0,
    alternatives: scored.titleAlternatives,
    brandAlternatives: scored.brandAlternatives,
    reasons: selectedTitle?.reasons || [],
    titleZone: titlePlacement.zone,
    brandZone: brandPlacement.zone,
    titleCandidate: titlePlacement,
    brandCandidate: brandPlacement,
    probableTextRegions: scored.textScan.probableTextRegions,
    typographyConfidence: scored.textScan.confidence,
    subjectHints: scored.subjectHints,
    requiresCrop: cropApplied,
    cropPlan: cropApplied ? cropPlan : null,
    requiresFallback,
    workingBuffer,
    method: "adaptive_overlay_layout",
  };
}

function resolveAdaptiveTitleTypography({
  title,
  zoneWidth,
  zoneHeight,
  imageWidth = WIDTH,
  imageHeight = HEIGHT,
}) {
  const displayTitle = String(title || "Economic Release").trim();
  const maxTextWidth = Math.floor(imageWidth * 0.35);
  const maxTextHeight = Math.floor(imageHeight * 0.18);
  let fontSize = 34;
  const minFontSize = 24;
  const maxLines = 2;
  const words = displayTitle.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  const maxChars = Math.max(12, Math.floor(zoneWidth / (fontSize * 0.52)));
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }

  let wrapped = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    wrapped[maxLines - 1] = `${wrapped[maxLines - 1].slice(0, Math.max(8, maxChars - 3))}...`;
  }

  const lineHeight = Math.round(fontSize * 1.18);
  while ((wrapped.length * lineHeight > maxTextHeight || wrapped.some((line) => line.length * fontSize * 0.52 > maxTextWidth)) && fontSize > minFontSize) {
    fontSize -= 2;
  }

  return {
    title: displayTitle,
    lines: wrapped,
    fontSize,
    lineHeight,
    maxTextWidth,
    maxTextHeight,
    previousFontSize: 48,
    reductionRatio: Number((1 - fontSize / 48).toFixed(2)),
  };
}

module.exports = {
  PLACEMENT_IDS,
  BRAND_CANDIDATES,
  TITLE_CANDIDATES,
  MIN_ACCEPTABLE_SCORE,
  detectProbableTextRegions,
  detectSubjectHints,
  scorePlacements,
  resolveAdaptiveLayout,
  resolveAdaptiveTitleTypography,
  evaluateCropPlan,
  applyCropPlan,
};
