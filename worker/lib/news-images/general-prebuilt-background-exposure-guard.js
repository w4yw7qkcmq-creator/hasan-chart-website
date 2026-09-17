const { CANVAS_SIZE } = require("./general-prebuilt-square-composer");

const NEAR_BLACK_LUMINANCE = 25;
const EXPOSURE_THRESHOLDS = {
  absoluteMeanFloor: 26,
  compositeMeanBelow: 45,
  compositeNearBlack25Above: 58,
  compositeMedianBelow: 22,
  excessiveNearBlack25Above: 78,
  excessiveNearBlackMeanBelow: 52,
  nightBalancedMeanAtLeast: 40,
  nightBalancedP10AtLeast: 6,
  nightBalancedMedianAtLeast: 24,
};

function computeLuminanceMetrics(rawBuffer, width, height, channels = 3) {
  const pixelCount = width * height;
  const luminances = new Array(pixelCount);
  let sum = 0;
  let nearBlackCount = 0;

  for (let pixelIndex = 0, offset = 0; pixelIndex < pixelCount; pixelIndex += 1, offset += channels) {
    const r = rawBuffer[offset];
    const g = rawBuffer[offset + 1];
    const b = rawBuffer[offset + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminances[pixelIndex] = luminance;
    sum += luminance;
    if (luminance < NEAR_BLACK_LUMINANCE) {
      nearBlackCount += 1;
    }
  }

  luminances.sort((a, b) => a - b);
  const meanLuminance = sum / pixelCount;
  const medianLuminance = luminances[Math.floor(pixelCount / 2)];
  const p10Luminance = luminances[Math.floor(pixelCount * 0.1)];
  const nearBlack25Pct = (nearBlackCount / pixelCount) * 100;

  return {
    meanLuminance: Number(meanLuminance.toFixed(2)),
    medianLuminance: Number(medianLuminance.toFixed(2)),
    p10Luminance: Number(p10Luminance.toFixed(2)),
    nearBlack25Pct: Number(nearBlack25Pct.toFixed(2)),
    pixelCount,
    width,
    height,
  };
}

function evaluateBackgroundExposure(metrics) {
  const reasons = [];

  if (metrics.meanLuminance < EXPOSURE_THRESHOLDS.absoluteMeanFloor) {
    reasons.push("mean_below_absolute_floor");
  }

  if (
    metrics.meanLuminance < EXPOSURE_THRESHOLDS.compositeMeanBelow &&
    metrics.nearBlack25Pct > EXPOSURE_THRESHOLDS.compositeNearBlack25Above &&
    metrics.medianLuminance < EXPOSURE_THRESHOLDS.compositeMedianBelow
  ) {
    reasons.push("composite_underexposed");
  }

  if (
    metrics.nearBlack25Pct > EXPOSURE_THRESHOLDS.excessiveNearBlack25Above &&
    metrics.meanLuminance < EXPOSURE_THRESHOLDS.excessiveNearBlackMeanBelow
  ) {
    reasons.push("excessive_near_black");
  }

  if (
    reasons.length > 0 &&
    metrics.meanLuminance >= EXPOSURE_THRESHOLDS.nightBalancedMeanAtLeast &&
    metrics.p10Luminance >= EXPOSURE_THRESHOLDS.nightBalancedP10AtLeast &&
    metrics.medianLuminance >= EXPOSURE_THRESHOLDS.nightBalancedMedianAtLeast
  ) {
    return {
      accepted: true,
      metrics,
      reasons: [],
      action: "exposure_pass_night_balanced",
    };
  }

  return {
    accepted: reasons.length === 0,
    metrics,
    reasons,
    action: reasons.length ? "BACKGROUND_UNDEREXPOSED_REJECTED" : "exposure_pass",
  };
}

async function inspectBackgroundExposure(backgroundBuffer, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  if (!backgroundBuffer?.length) {
    throw new Error("inspectBackgroundExposure requires a background buffer");
  }

  const { data, info } = await sharp(backgroundBuffer)
    .rotate()
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const metrics = computeLuminanceMetrics(data, info.width, info.height, info.channels);
  const evaluation = evaluateBackgroundExposure(metrics);

  return {
    ...evaluation,
    acceptedForComposition: evaluation.accepted,
    method: "general_prebuilt_luminance_heuristic",
  };
}

module.exports = {
  NEAR_BLACK_LUMINANCE,
  EXPOSURE_THRESHOLDS,
  computeLuminanceMetrics,
  evaluateBackgroundExposure,
  inspectBackgroundExposure,
};
