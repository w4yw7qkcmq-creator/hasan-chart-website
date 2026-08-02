const fs = require("fs");
const path = require("path");
const { WIDTH, HEIGHT, resolveSafeZones } = require("./overlay-safe-zones");

const TRANSITION_THRESHOLD = 28;
const ROW_ACTIVITY_THRESHOLD = 0.09;
const BLOCK_ACTIVITY_THRESHOLD = 0.11;
const LARGE_TEXT_CONFIDENCE = 0.62;
const ZONE_TEXT_CONFIDENCE = 0.48;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(rect = {}, maxWidth = WIDTH, maxHeight = HEIGHT) {
  const x = clamp(Math.floor(rect.x || 0), 0, Math.max(0, maxWidth - 1));
  const y = clamp(Math.floor(rect.y || 0), 0, Math.max(0, maxHeight - 1));
  const width = clamp(Math.floor(rect.width || 0), 1, maxWidth - x);
  const height = clamp(Math.floor(rect.height || 0), 1, maxHeight - y);
  return { x, y, width, height };
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function analyzeRawZone(data, width, height) {
  const rowActivity = new Array(height).fill(0);
  let activeRows = 0;
  let activeBlocks = 0;

  for (let y = 0; y < height; y += 1) {
    let transitions = 0;
    let rowVariance = 0;
    const rowOffset = y * width * 3;
    const samples = [];

    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x * 3;
      const value = luminance(data[idx], data[idx + 1], data[idx + 2]);
      samples.push(value);
      if (x > 0) {
        const prev = luminance(data[rowOffset + (x - 1) * 3], data[rowOffset + (x - 1) * 3 + 1], data[rowOffset + (x - 1) * 3 + 2]);
        if (Math.abs(value - prev) >= TRANSITION_THRESHOLD) {
          transitions += 1;
        }
      }
    }

    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    rowVariance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
    const activity = transitions / Math.max(1, width);
    rowActivity[y] = activity;

    if (activity >= ROW_ACTIVITY_THRESHOLD && rowVariance >= 180) {
      activeRows += 1;
    }
  }

  let streak = 0;
  for (let y = 0; y < height; y += 1) {
    if (rowActivity[y] >= ROW_ACTIVITY_THRESHOLD) {
      streak += 1;
      if (streak >= 3) {
        activeBlocks += 1;
      }
    } else {
      streak = 0;
    }
  }

  const rowScore = activeRows / Math.max(1, height);
  const blockScore = activeBlocks / Math.max(1, Math.floor(height / 8));
  const confidence = clamp(rowScore * 0.65 + blockScore * 0.35, 0, 1);

  return {
    confidence,
    activeRows,
    activeBlocks,
    bounds: confidence >= ZONE_TEXT_CONFIDENCE ? { x: 0, y: 0, width, height } : null,
  };
}

async function loadRawImage(imageInput, sharp) {
  let buffer = imageInput;
  if (typeof imageInput === "string") {
    buffer = fs.readFileSync(imageInput);
  }

  const image = sharp(buffer).resize(WIDTH, HEIGHT, { fit: "cover" });
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, buffer };
}

async function inspectZone(sharp, sourceBuffer, rect) {
  const zone = normalizeRect(rect);
  const { data, info } = await sharp(sourceBuffer)
    .extract({ left: zone.x, top: zone.y, width: zone.width, height: zone.height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const analysis = analyzeRawZone(data, info.width, info.height);
  return {
    ...analysis,
    rect: zone,
    intersectsBrandZone: false,
    intersectsTitleZone: false,
  };
}

const TYPOGRAPHY_REJECT_THRESHOLD = 0.55;
const TYPOGRAPHY_STREAK_MIN_ROWS = 4;

function analyzeTypographyBand(data, width, height) {
  const base = analyzeRawZone(data, width, height);
  let streak = 0;
  let maxStreak = 0;
  const rowActivity = [];

  for (let y = 0; y < height; y += 1) {
    let transitions = 0;
    const rowOffset = y * width * 3;
    for (let x = 1; x < width; x += 1) {
      const idx = rowOffset + x * 3;
      const prev = luminance(data[idx - 3], data[idx - 2], data[idx - 1]);
      const value = luminance(data[idx], data[idx + 1], data[idx + 2]);
      if (Math.abs(value - prev) >= TRANSITION_THRESHOLD) {
        transitions += 1;
      }
    }
    const activity = transitions / Math.max(1, width);
    rowActivity.push(activity);
    if (activity >= ROW_ACTIVITY_THRESHOLD) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  const typographyLikely = maxStreak >= TYPOGRAPHY_STREAK_MIN_ROWS && base.confidence >= ZONE_TEXT_CONFIDENCE;
  return {
    ...base,
    maxStreak,
    typographyLikely,
    confidence: typographyLikely ? Math.max(base.confidence, ZONE_TEXT_CONFIDENCE + 0.05) : base.confidence * 0.75,
  };
}

async function inspectRawBackgroundForTypography(imageInput, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  const { buffer } = await loadRawImage(imageInput, sharp);
  const scanBands = [
    normalizeRect({ x: 0, y: 0, width: WIDTH, height: 170 }),
    normalizeRect({ x: 0, y: 170, width: WIDTH, height: 220 }),
    normalizeRect({ x: 0, y: 390, width: WIDTH, height: 285 }),
    normalizeRect({ x: 120, y: 220, width: 960, height: 180 }),
    normalizeRect({ x: 0, y: 460, width: WIDTH, height: 215 }),
  ];

  const regions = [];
  for (const band of scanBands) {
    const zone = normalizeRect(band);
    const { data, info } = await sharp(buffer)
      .extract({ left: zone.x, top: zone.y, width: zone.width, height: zone.height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const analysis = analyzeTypographyBand(data, info.width, info.height);
    if (analysis.typographyLikely) {
      regions.push({
        rect: zone,
        confidence: analysis.confidence,
        maxStreak: analysis.maxStreak,
        type: "probable_generated_typography",
      });
    }
  }

  const confidence = regions.length ? Math.max(...regions.map((region) => region.confidence)) : 0;
  const probableTextDetected = confidence >= TYPOGRAPHY_REJECT_THRESHOLD;
  const acceptedForComposition = !probableTextDetected;

  return {
    probableTextDetected,
    confidence,
    regions,
    imageStage: "raw_background",
    acceptedForComposition,
    action: acceptedForComposition ? "compose_official_headline" : "OPENAI_GENERATED_TYPOGRAPHY_REJECTED",
    method: "visual_heuristic_only",
  };
}

async function inspectGeneratedBackground(imageInput, overlayLayout = {}, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    try {
      sharp = require("sharp");
    } catch (_error) {
      throw new Error("sharp is required for inspectGeneratedBackground");
    }
  }

  const safeZones = resolveSafeZones(overlayLayout);
  const { buffer } = await loadRawImage(imageInput, sharp);

  const brandInspection = await inspectZone(sharp, buffer, safeZones.brandSafeZone);
  brandInspection.intersectsBrandZone = true;

  const titleInspection = await inspectZone(sharp, buffer, safeZones.titleSafeZone);
  titleInspection.intersectsTitleZone = true;

  const fullBandRects = [
    normalizeRect({ x: 0, y: 190, width: WIDTH, height: 240 }),
    normalizeRect({ x: 120, y: 250, width: 960, height: 160 }),
  ];

  const outsideRegions = [];
  for (const rect of fullBandRects) {
    if (rectsIntersect(rect, safeZones.brandSafeZone) || rectsIntersect(rect, safeZones.titleSafeZone)) {
      continue;
    }
    const inspection = await inspectZone(sharp, buffer, rect);
    if (inspection.confidence >= LARGE_TEXT_CONFIDENCE) {
      outsideRegions.push({
        ...inspection,
        rect,
        outsideSafeZones: true,
      });
    }
  }

  const regions = [];
  if (brandInspection.confidence >= ZONE_TEXT_CONFIDENCE) {
    regions.push({ ...brandInspection, zone: "brandSafeZone" });
  }
  if (titleInspection.confidence >= ZONE_TEXT_CONFIDENCE) {
    regions.push({ ...titleInspection, zone: "titleSafeZone" });
  }
  regions.push(...outsideRegions);

  const intersectsBrandZone = brandInspection.confidence >= ZONE_TEXT_CONFIDENCE;
  const intersectsTitleZone = titleInspection.confidence >= ZONE_TEXT_CONFIDENCE;
  const largeOutsideText = outsideRegions.some((region) => region.confidence >= LARGE_TEXT_CONFIDENCE);
  const detected = regions.length > 0 && Math.max(...regions.map((region) => region.confidence)) >= ZONE_TEXT_CONFIDENCE;
  const confidence = detected ? Math.max(...regions.map((region) => region.confidence)) : 0;

  let action = "none";
  if (intersectsBrandZone || intersectsTitleZone) {
    action = "cover_safe_zones";
  } else if (largeOutsideText) {
    action = "attempt_safe_crop";
  }

  return {
    detected,
    confidence,
    regions,
    intersectsBrandZone,
    intersectsTitleZone,
    largeOutsideText,
    action,
    safeZones,
    method: "visual_heuristic_only",
  };
}

function buildCoverSvg(rect, options = {}) {
  const zone = normalizeRect(rect);
  const blurStrength = options.blurStrength || 18;
  const opacity = options.opacity || 0.72;
  return Buffer.from(`
    <svg width="${zone.width}" height="${zone.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blurPlate" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${blurStrength}"/>
        </filter>
        <linearGradient id="softPlate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(8,12,20,${opacity * 0.55})"/>
          <stop offset="100%" stop-color="rgba(8,12,20,${opacity})"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${zone.width}" height="${zone.height}" fill="url(#softPlate)" filter="url(#blurPlate)"/>
    </svg>
  `);
}

async function coverSafeZone(sharp, buffer, rect) {
  const zone = normalizeRect(rect);
  const cover = buildCoverSvg(zone);
  return sharp(buffer)
    .composite([{ input: cover, top: zone.y, left: zone.x }])
    .png()
    .toBuffer();
}

async function applySafeZoneCovers(sharp, buffer, inspection) {
  let working = buffer;
  const covered = [];

  if (inspection.intersectsBrandZone) {
    working = await coverSafeZone(sharp, working, inspection.safeZones.brandSafeZone);
    covered.push("brandSafeZone");
  }
  if (inspection.intersectsTitleZone) {
    working = await coverSafeZone(sharp, working, inspection.safeZones.titleSafeZone);
    covered.push("titleSafeZone");
  }

  return { buffer: working, covered };
}

function evaluateSafeCrop(inspection) {
  if (!inspection.largeOutsideText) {
    return { ok: false, reason: "no_large_outside_text" };
  }

  const outside = inspection.regions.filter((region) => region.outsideSafeZones);
  const maxOutside = outside.reduce((best, region) => (region.confidence > best.confidence ? region : best), {
    confidence: 0,
    rect: null,
  });

  if (!maxOutside.rect || maxOutside.confidence < LARGE_TEXT_CONFIDENCE) {
    return { ok: false, reason: "outside_text_not_confident_enough" };
  }

  if (maxOutside.rect.y < 220) {
    return { ok: false, reason: "crop_would_damage_primary_subject" };
  }

  const cropTop = clamp(maxOutside.rect.y + Math.floor(maxOutside.rect.height * 0.35), 0, 120);
  return {
    ok: true,
    cropTop,
    reason: "safe_vertical_crop",
  };
}

async function attemptSafeCrop(sharp, buffer, inspection) {
  const plan = evaluateSafeCrop(inspection);
  if (!plan.ok) {
    return { ok: false, buffer, plan };
  }

  const metadata = await sharp(buffer).metadata();
  const sourceHeight = metadata.height || HEIGHT;
  const sourceWidth = metadata.width || WIDTH;
  const extractHeight = sourceHeight - plan.cropTop;
  if (extractHeight <= Math.floor(sourceHeight * 0.72)) {
    return { ok: false, buffer, plan: { ok: false, reason: "crop_too_aggressive" } };
  }

  const cropped = await sharp(buffer)
    .extract({ left: 0, top: plan.cropTop, width: sourceWidth, height: extractHeight })
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .png()
    .toBuffer();

  return { ok: true, buffer: cropped, plan };
}

async function sanitizeGeneratedBackground(backgroundBuffer, overlayLayout = {}, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  const inspection = await inspectGeneratedBackground(backgroundBuffer, overlayLayout, { sharp });
  if (!inspection.detected) {
    return {
      buffer: backgroundBuffer,
      inspection,
      action: "none",
      usedFallback: false,
    };
  }

  if (inspection.action === "cover_safe_zones") {
    const covered = await applySafeZoneCovers(sharp, backgroundBuffer, inspection);
    return {
      buffer: covered.buffer,
      inspection,
      action: "cover_safe_zones",
      coveredZones: covered.covered,
      usedFallback: false,
    };
  }

  if (inspection.action === "attempt_safe_crop") {
    const cropResult = await attemptSafeCrop(sharp, backgroundBuffer, inspection);
    if (cropResult.ok) {
      const recheck = await inspectGeneratedBackground(cropResult.buffer, overlayLayout, { sharp });
      if (!recheck.largeOutsideText) {
        return {
          buffer: cropResult.buffer,
          inspection: recheck,
          action: "safe_crop",
          usedFallback: false,
        };
      }
    }

    return {
      buffer: backgroundBuffer,
      inspection,
      action: "OPENAI_BACKGROUND_TEXT_UNSAFE_FALLBACK",
      usedFallback: true,
    };
  }

  return {
    buffer: backgroundBuffer,
    inspection,
    action: "none",
    usedFallback: false,
  };
}

module.exports = {
  inspectRawBackgroundForTypography,
  analyzeTypographyBand,
  inspectGeneratedBackground,
  sanitizeGeneratedBackground,
  applySafeZoneCovers,
  attemptSafeCrop,
  evaluateSafeCrop,
  analyzeRawZone,
  buildCoverSvg,
  loadRawImage,
  normalizeRect,
  rectsIntersect,
  luminance,
  TYPOGRAPHY_REJECT_THRESHOLD,
  TYPOGRAPHY_STREAK_MIN_ROWS,
  ZONE_TEXT_CONFIDENCE,
  LARGE_TEXT_CONFIDENCE,
};
