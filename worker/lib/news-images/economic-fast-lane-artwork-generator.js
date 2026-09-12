const fs = require("fs");
const path = require("path");
const { listManifestEntries, getPoolBaseDir } = require("./economic-fast-lane-artwork-manifest");
const {
  ARTWORK_PROMPT_DEFINITIONS,
  getPromptDefinitionMap,
  validatePromptDefinitionsAgainstManifest,
} = require("./economic-fast-lane-artwork-prompts");
const {
  CANVAS_SIZE,
  composeSquareArtwork,
  inspectSquareBackgroundForTypography,
} = require("./economic-fast-lane-square-composer");
const axios = require("axios");
const { createImageProviderResult } = require("./image-provider-interface");
const { resolveOpenAIImageSettings } = require("./openai-image-settings");
const { classifyImageError, isTransientImageError } = require("./image-error-classifier");
const { validateEconomicFastLaneArtwork } = require("./validate-economic-fast-lane-artwork");

const SAFETY_ENV = "ALLOW_ECONOMIC_FAST_LANE_ARTWORK_GENERATION";
const DEFAULT_JPEG_QUALITY = 82;
const MIN_JPEG_QUALITY = 60;
const TARGET_MAX_BYTES = 300 * 1024;
const MAX_ATTEMPTS_PER_ASSET = 2;

const FORBIDDEN_MODULE_PATTERNS = [
  "news-worker",
  "image-orchestrator",
  "publisher-gateway",
  "image-storage",
  "quality-gate",
];

function createSceneOpenAIImageProvider(options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const httpClient = options.httpClient || axios;
  const settings = resolveOpenAIImageSettings(options);

  return {
    name: "openai",
    settings,

    async generateBackground(context = {}) {
      const prompt = context.scenePrompt || context.summary || context.sourceText;
      if (!prompt) {
        throw new Error("scenePrompt is required for offline artwork generation");
      }
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for scene background generation");
      }

      const requestStartedAt = Date.now();
      const response = await httpClient.post(
        "https://api.openai.com/v1/images/generations",
        {
          model: settings.model,
          prompt,
          size: settings.size,
          quality: settings.quality,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: settings.providerTimeoutMs,
          validateStatus: () => true,
        }
      );

      if (response.status >= 400) {
        const apiMessage =
          response.data?.error?.message || response.data?.message || `HTTP ${response.status}`;
        const wrapped = new Error(`OpenAI scene generation failed: ${apiMessage}`);
        wrapped.statusCode = response.status;
        throw wrapped;
      }

      const item = response.data?.data?.[0];
      let backgroundBuffer = null;
      if (item?.b64_json) {
        backgroundBuffer = Buffer.from(item.b64_json, "base64");
      } else if (item?.url) {
        const imageResponse = await httpClient.get(item.url, {
          responseType: "arraybuffer",
          timeout: settings.downloadTimeoutMs,
        });
        backgroundBuffer = Buffer.from(imageResponse.data);
      }

      if (!backgroundBuffer?.length) {
        throw new Error("OpenAI scene generation returned no image data");
      }

      return createImageProviderResult({
        backgroundBuffer,
        provider: "openai",
        cached: false,
        prompt,
        model: settings.model,
        size: settings.size,
        quality: settings.quality,
        timings: {
          providerRequestMs: Date.now() - requestStartedAt,
        },
      });
    },
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    dryRun: false,
    force: false,
    category: null,
    limit: null,
    start: 1,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg.startsWith("--category=")) {
      options.category = arg.slice("--category=".length).trim();
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--start=")) {
      options.start = Number(arg.slice("--start=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.limit != null && (!Number.isFinite(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isFinite(options.start) || options.start < 1) {
    throw new Error("--start must be a positive integer");
  }

  return options;
}

function assertSafetyGate(options = {}) {
  if (options.dryRun) {
    return;
  }
  if (process.env[SAFETY_ENV] !== "1") {
    const message = [
      "Economic Fast-Lane artwork generation blocked.",
      `Set ${SAFETY_ENV}=1 to enable paid OpenAI generation.`,
      "Use --dry-run to inspect the plan without API calls or file writes.",
    ].join(" ");
    const error = new Error(message);
    error.code = "SAFETY_GATE_BLOCKED";
    throw error;
  }
}

function buildWorkQueue(options = {}) {
  const baseDir = options.poolBaseDir || getPoolBaseDir();
  const promptMap = getPromptDefinitionMap();
  const entries = listManifestEntries(baseDir)
    .map((entry, index) => ({
      index: index + 1,
      ...entry,
      prompt: promptMap.get(entry.relativePath),
    }))
    .filter((entry) => entry.prompt);

  let filtered = entries;
  if (options.category) {
    filtered = filtered.filter((entry) => entry.category === options.category);
  }
  if (options.start > 1) {
    filtered = filtered.filter((entry) => entry.index >= options.start);
  }
  if (options.limit != null) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

async function validateExistingAsset(absolutePath, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  if (!fs.existsSync(absolutePath)) {
    return { valid: false, reason: "missing" };
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size === 0) {
    return { valid: false, reason: "empty_or_not_file" };
  }

  if (!/\.jpe?g$/i.test(absolutePath)) {
    return { valid: false, reason: "invalid_extension" };
  }

  try {
    const metadata = await sharp(absolutePath).metadata();
    if (metadata.width !== CANVAS_SIZE || metadata.height !== CANVAS_SIZE) {
      return { valid: false, reason: "invalid_dimensions", metadata };
    }
    await sharp(absolutePath).jpeg().toBuffer();
    return { valid: true, sizeBytes: stat.size, metadata };
  } catch (_error) {
    return { valid: false, reason: "decode_failed" };
  }
}

async function encodeSquareJpeg(pngBuffer, options = {}) {
  let sharp = options.sharp;
  if (!sharp) {
    sharp = require("sharp");
  }

  let quality = options.jpegQuality || DEFAULT_JPEG_QUALITY;
  let output = await sharp(pngBuffer).jpeg({ quality, mozjpeg: true }).toBuffer();

  while (output.length > TARGET_MAX_BYTES && quality > MIN_JPEG_QUALITY) {
    quality -= 4;
    output = await sharp(pngBuffer).jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  return sharp(output).withMetadata(false).jpeg({ quality, mozjpeg: true }).toBuffer();
}

async function processBackgroundToJpeg(backgroundBuffer, promptDefinition, options = {}) {
  const typographyInspection = await inspectSquareBackgroundForTypography(backgroundBuffer, options);
  if (!typographyInspection.acceptedForComposition) {
    const error = new Error("OPENAI_GENERATED_TYPOGRAPHY_REJECTED");
    error.code = "AI_TYPOGRAPHY_REJECTED";
    error.typographyInspection = typographyInspection;
    throw error;
  }

  const composed = await composeSquareArtwork(backgroundBuffer, {
    displayTitle: promptDefinition.displayTitle,
    subtitle: promptDefinition.subtitle,
  }, options);

  const jpegBuffer = await encodeSquareJpeg(composed.buffer, options);
  return {
    jpegBuffer,
    typographyInspection,
    composed,
  };
}

async function generateSingleAsset(workItem, options = {}) {
  const provider =
    options.provider ||
    createSceneOpenAIImageProvider({
      apiKey: options.apiKey,
      ...(options.openAiSettings || {}),
    });

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ASSET; attempt += 1) {
    try {
      if (options.onProviderCall) {
        options.onProviderCall(workItem, attempt);
      }

      const background = await provider.generateBackground({
        scenePrompt: workItem.prompt.scenePrompt,
      });

      const processed = await processBackgroundToJpeg(background.backgroundBuffer, workItem.prompt, options);
      return {
        ok: true,
        attempts: attempt,
        ...processed,
        provider: background.provider,
        prompt: workItem.prompt.scenePrompt,
      };
    } catch (error) {
      lastError = error;
      const retryable =
        isTransientImageError(error) || error.code === "AI_TYPOGRAPHY_REJECTED" || error.reasonCode === "AI_OUTPUT_REJECTED";
      if (attempt >= MAX_ATTEMPTS_PER_ASSET || !retryable) {
        break;
      }
    }
  }

  return {
    ok: false,
    attempts: MAX_ATTEMPTS_PER_ASSET,
    error: lastError,
  };
}

function promptDefinitionDisplay(promptDefinition) {
  return `${promptDefinition.displayTitle} / ${promptDefinition.subtitle}`;
}

function buildDryRunPlan(options = {}) {
  const validation = validatePromptDefinitionsAgainstManifest(options.poolBaseDir);
  const queue = buildWorkQueue(options);
  return {
    dryRun: true,
    safetyGateRequired: false,
    promptValidation: validation,
    totalManifestAssets: ARTWORK_PROMPT_DEFINITIONS.length,
    plannedCount: queue.length,
    plannedAssets: queue.map((item) => ({
      index: item.index,
      path: item.relativePath,
      absolutePath: item.absolutePath,
      category: item.category,
      displayTitle: item.prompt.displayTitle,
      subtitle: item.prompt.subtitle,
      scenePreview: item.prompt.scenePrompt.slice(0, 180) + "...",
    })),
  };
}

async function runGenerator(options = {}) {
  assertSafetyGate(options);

  const promptValidation = validatePromptDefinitionsAgainstManifest(options.poolBaseDir);
  if (!promptValidation.ok) {
    const error = new Error("Prompt definitions failed validation");
    error.code = "PROMPT_VALIDATION_FAILED";
    error.issues = promptValidation.issues;
    throw error;
  }

  const queue = buildWorkQueue(options);
  const summary = {
    generated: 0,
    skipped: 0,
    failed: 0,
    total: queue.length,
    results: [],
  };

  for (const [queueIndex, workItem] of queue.entries()) {
    const label = `[${String(queueIndex + 1).padStart(2, "0")}/${String(queue.length).padStart(2, "0")}]`;
    const existing = await validateExistingAsset(workItem.absolutePath, options);

    if (existing.valid && !options.force) {
      summary.skipped += 1;
      summary.results.push({
        path: workItem.relativePath,
        status: "skipped",
        message: `${label} skipped ${workItem.relativePath}`,
      });
      continue;
    }

    fs.mkdirSync(path.dirname(workItem.absolutePath), { recursive: true });

    const generation = await generateSingleAsset(workItem, options);
    if (!generation.ok) {
      summary.failed += 1;
      summary.results.push({
        path: workItem.relativePath,
        status: "failed",
        message: `${label} failed ${workItem.relativePath}`,
        error: generation.error?.message || "generation_failed",
      });
      continue;
    }

    fs.writeFileSync(workItem.absolutePath, generation.jpegBuffer);
    const postCheck = await validateExistingAsset(workItem.absolutePath, options);
    if (!postCheck.valid) {
      summary.failed += 1;
      if (fs.existsSync(workItem.absolutePath)) {
        fs.unlinkSync(workItem.absolutePath);
      }
      summary.results.push({
        path: workItem.relativePath,
        status: "failed",
        message: `${label} failed validation after write ${workItem.relativePath}`,
        error: postCheck.reason,
      });
      continue;
    }

    summary.generated += 1;
    summary.results.push({
      path: workItem.relativePath,
      status: "generated",
      message: `${label} generated ${workItem.relativePath}`,
      sizeBytes: postCheck.sizeBytes,
      attempts: generation.attempts,
    });
  }

  summary.validation = validateEconomicFastLaneArtwork({
    poolBaseDir: options.poolBaseDir,
    requireAllPresent: false,
  });

  return summary;
}

function formatSummaryReport(summary) {
  const lines = summary.results.map((result) => result.message);
  lines.push("");
  lines.push("generated:", String(summary.generated));
  lines.push("skipped:", String(summary.skipped));
  lines.push("failed:", String(summary.failed));
  lines.push("total:", String(summary.total));
  if (summary.validation?.summary) {
    lines.push(
      "validation:",
      JSON.stringify({
        valid: summary.validation.summary.presentCount,
        missing: summary.validation.summary.missingCount,
        invalid: summary.validation.summary.issueCount,
        unexpected: summary.validation.files.issues.filter((issue) => issue.code === "UNEXPECTED_FILENAME").length,
      })
    );
  }
  return lines.join("\n");
}

module.exports = {
  SAFETY_ENV,
  DEFAULT_JPEG_QUALITY,
  MAX_ATTEMPTS_PER_ASSET,
  FORBIDDEN_MODULE_PATTERNS,
  createSceneOpenAIImageProvider,
  parseCliArgs,
  assertSafetyGate,
  buildWorkQueue,
  validateExistingAsset,
  encodeSquareJpeg,
  processBackgroundToJpeg,
  generateSingleAsset,
  buildDryRunPlan,
  runGenerator,
  formatSummaryReport,
};
