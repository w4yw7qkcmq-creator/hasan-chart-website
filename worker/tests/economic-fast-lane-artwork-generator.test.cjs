#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-images");
const repoRoot = path.join(__dirname, "..", "..");

const {
  ARTWORK_PROMPT_DEFINITIONS,
  validatePromptDefinitionsAgainstManifest,
  getPromptDefinitionMap,
} = require(path.join(root, "economic-fast-lane-artwork-prompts"));
const {
  buildSquareOverlaySvg,
  composeSquareArtwork,
  CANVAS_SIZE,
  BRAND_NAME,
} = require(path.join(root, "economic-fast-lane-square-composer"));
const {
  SAFETY_ENV,
  parseCliArgs,
  assertSafetyGate,
  buildWorkQueue,
  buildDryRunPlan,
  runGenerator,
  validateExistingAsset,
  generateSingleAsset,
  FORBIDDEN_MODULE_PATTERNS,
} = require(path.join(root, "economic-fast-lane-artwork-generator"));

const sharp = require("sharp");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function createSolidBackground(width = 1536, height = 1024, color = "#112233") {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

async function createValidSquareJpeg(targetPath) {
  const png = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 3,
      background: "#101820",
    },
  })
    .png()
    .toBuffer();
  const composed = await composeSquareArtwork(png, {
    displayTitle: "FEDERAL RESERVE",
    subtitle: "MONETARY POLICY",
  });
  const jpeg = await sharp(composed.buffer).jpeg({ quality: 82 }).toBuffer();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, jpeg);
  return jpeg;
}

function createMockProvider({ failOnPath = null, callCounter = { count: 0 } } = {}) {
  return {
    name: "mock-openai",
    async generateBackground() {
      callCounter.count += 1;
      if (failOnPath) {
        throw new Error(`mock failure for ${failOnPath}`);
      }
      return {
        backgroundBuffer: await createSolidBackground(),
        provider: "mock-openai",
        prompt: "mock",
      };
    },
  };
}

function withSafetyGateEnabled(fn) {
  const previous = process.env[SAFETY_ENV];
  process.env[SAFETY_ENV] = "1";
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous) {
        process.env[SAFETY_ENV] = previous;
      } else {
        delete process.env[SAFETY_ENV];
      }
    });
}

async function testPromptMapHasExactly50Entries() {
  assert.strictEqual(ARTWORK_PROMPT_DEFINITIONS.length, 50);
  const validation = validatePromptDefinitionsAgainstManifest();
  assert.strictEqual(validation.ok, true, JSON.stringify(validation.issues));
}

async function testEveryManifestAssetHasPromptDefinition() {
  const map = getPromptDefinitionMap();
  assert.strictEqual(map.size, 50);
  for (const definition of ARTWORK_PROMPT_DEFINITIONS) {
    assert.ok(map.has(definition.path), definition.path);
  }
}

async function testNoDuplicateTargetPaths() {
  const paths = ARTWORK_PROMPT_DEFINITIONS.map((definition) => definition.path);
  assert.strictEqual(new Set(paths).size, paths.length);
}

async function testDryRunPerformsZeroProviderCalls() {
  const callCounter = { count: 0 };
  const plan = buildDryRunPlan({ category: "fed", limit: 2 });
  assert.strictEqual(plan.dryRun, true);
  assert.strictEqual(plan.plannedCount, 2);
  assert.strictEqual(plan.promptValidation.ok, true);
  assert.strictEqual(callCounter.count, 0);
  assert.ok(plan.plannedAssets.every((asset) => asset.displayTitle && asset.subtitle));
}

async function testSafetyGateBlocksGeneration() {
  const previous = process.env[SAFETY_ENV];
  delete process.env[SAFETY_ENV];
  try {
    assert.throws(() => assertSafetyGate({ dryRun: false }), /blocked/i);
    assert.doesNotThrow(() => assertSafetyGate({ dryRun: true }));
  } finally {
    if (previous) {
      process.env[SAFETY_ENV] = previous;
    }
  }
}

async function testExistingFileSkips() {
  const poolDir = path.join(os.tmpdir(), `fast-lane-gen-${Date.now()}-skip`);
  const queue = buildWorkQueue({ poolBaseDir: poolDir, category: "fed", limit: 1 });
  assert.strictEqual(queue.length, 1);
  await createValidSquareJpeg(queue[0].absolutePath);

  const callCounter = { count: 0 };
  const summary = await withSafetyGateEnabled(() =>
    runGenerator({
      poolBaseDir: poolDir,
      category: "fed",
      limit: 1,
      provider: createMockProvider({ callCounter }),
    })
  );

  assert.strictEqual(summary.skipped, 1);
  assert.strictEqual(summary.generated, 0);
  assert.strictEqual(callCounter.count, 0);
}

async function testForceAllowsOverwrite() {
  const poolDir = path.join(os.tmpdir(), `fast-lane-gen-${Date.now()}-force`);
  const queue = buildWorkQueue({ poolBaseDir: poolDir, category: "fed", limit: 1 });
  await createValidSquareJpeg(queue[0].absolutePath);
  const before = fs.statSync(queue[0].absolutePath).mtimeMs;

  const provider = createMockProvider();

  await new Promise((resolve) => setTimeout(resolve, 5));
  const summary = await withSafetyGateEnabled(() =>
    runGenerator({
      poolBaseDir: poolDir,
      category: "fed",
      limit: 1,
      force: true,
      provider,
    })
  );

  assert.strictEqual(summary.generated, 1);
  const after = fs.statSync(queue[0].absolutePath).mtimeMs;
  assert.ok(after >= before);
}

async function testCategoryFilterWorks() {
  const queue = buildWorkQueue({ category: "fed" });
  assert.strictEqual(queue.length, 5);
  assert.ok(queue.every((item) => item.category === "fed"));
}

async function testLimitWorks() {
  const queue = buildWorkQueue({ category: "fed", limit: 2 });
  assert.strictEqual(queue.length, 2);
  assert.strictEqual(queue[0].relativePath, "fed/01.jpg");
  assert.strictEqual(queue[1].relativePath, "fed/02.jpg");
}

async function testFailedGenerationContinuesNextAsset() {
  const poolDir = path.join(os.tmpdir(), `fast-lane-gen-${Date.now()}-fail`);
  const queue = buildWorkQueue({ poolBaseDir: poolDir, category: "fed", limit: 2 });
  assert.strictEqual(queue.length, 2);

  let callCount = 0;
  const provider = {
    name: "mock-openai",
    async generateBackground() {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("mock transient provider failure");
      }
      return {
        backgroundBuffer: await createSolidBackground(),
        provider: "mock-openai",
        prompt: "mock",
      };
    },
  };

  const summary = await withSafetyGateEnabled(() =>
    runGenerator({
      poolBaseDir: poolDir,
      category: "fed",
      limit: 2,
      provider,
    })
  );

  assert.strictEqual(summary.failed, 1);
  assert.strictEqual(summary.generated, 1);
  assert.strictEqual(summary.total, 2);
}

async function testResumeLogicWorks() {
  const poolDir = path.join(os.tmpdir(), `fast-lane-gen-${Date.now()}-resume`);
  const queue = buildWorkQueue({ poolBaseDir: poolDir, category: "fed", limit: 2 });
  await createValidSquareJpeg(queue[0].absolutePath);

  const callCounter = { count: 0 };
  const summary = await withSafetyGateEnabled(() =>
    runGenerator({
      poolBaseDir: poolDir,
      category: "fed",
      limit: 2,
      provider: createMockProvider({ callCounter }),
    })
  );

  assert.strictEqual(summary.skipped, 1);
  assert.strictEqual(summary.generated, 1);
  assert.strictEqual(callCounter.count, 1);
}

async function testOneItemProducesOneFile() {
  const poolDir = path.join(os.tmpdir(), `fast-lane-gen-${Date.now()}-one`);
  const queue = buildWorkQueue({ poolBaseDir: poolDir, category: "generic-economic", limit: 1 });
  const summary = await withSafetyGateEnabled(() =>
    runGenerator({
      poolBaseDir: poolDir,
      category: "generic-economic",
      limit: 1,
      provider: createMockProvider(),
    })
  );
  assert.strictEqual(summary.generated, 1);
  const files = fs.readdirSync(path.join(poolDir, "generic-economic"));
  assert.deepStrictEqual(files, ["01.jpg"]);
}

async function testNoCollageLogicExists() {
  const generatorSource = readSource("worker/lib/news-images/economic-fast-lane-artwork-generator.js");
  assert.ok(!/collage|contact sheet|sprite sheet|multi-image canvas/i.test(generatorSource));
}

async function testDeterministicOverlayStringsCorrect() {
  const svg = buildSquareOverlaySvg({
    displayTitle: "US CPI",
    subtitle: "CONSUMER PRICES",
  });
  assert.ok(svg.includes(BRAND_NAME));
  assert.ok(svg.includes("Macro Data"));
  assert.ok(svg.includes("US CPI"));
  assert.ok(svg.includes("CONSUMER PRICES"));
  assert.ok(svg.includes(">EN<"));
}

async function testOutputTargetIs1080Jpg() {
  const background = await createSolidBackground();
  const composed = await composeSquareArtwork(background, {
    displayTitle: "GDP REPORT",
    subtitle: "ECONOMIC GROWTH",
  });
  assert.strictEqual(composed.width, 1080);
  assert.strictEqual(composed.height, 1080);

  const poolDir = path.join(os.tmpdir(), `fast-lane-gen-${Date.now()}-jpg`);
  const target = path.join(poolDir, "fed", "01.jpg");
  const summary = await withSafetyGateEnabled(() =>
    runGenerator({
      poolBaseDir: poolDir,
      category: "fed",
      limit: 1,
      provider: createMockProvider(),
    })
  );
  assert.strictEqual(summary.generated, 1);
  const validation = await validateExistingAsset(target, { sharp });
  assert.strictEqual(validation.valid, true);
}

function testNoForbiddenImports() {
  const files = [
    "worker/lib/news-images/economic-fast-lane-artwork-generator.js",
    "worker/lib/news-images/economic-fast-lane-artwork-prompts.js",
    "worker/lib/news-images/economic-fast-lane-square-composer.js",
    "scripts/generate-economic-fast-lane-artwork.js",
  ];

  for (const file of files) {
    const source = readSource(file);
    for (const pattern of FORBIDDEN_MODULE_PATTERNS) {
      const importPattern = new RegExp(`require\\([^)]*${pattern}|from ['"][^'"]*${pattern}`);
      assert.ok(!importPattern.test(source), `${file} must not import ${pattern}`);
    }
    assert.ok(
      !/require\([^)]*(publisher-gateway|image-orchestrator|image-storage|news-worker|supabase)|from ['"][^'"]*(publisher-gateway|image-orchestrator|image-storage|news-worker|supabase)/i.test(
        source
      ),
      file
    );
  }
}

async function testNoApiKeyLogging() {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-secret-key-do-not-log";
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    assert.throws(() => assertSafetyGate({ dryRun: false }), /blocked/i);
  } finally {
    console.error = originalError;
    if (previous) {
      process.env.OPENAI_API_KEY = previous;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  }
  assert.ok(!logs.join("\n").includes("sk-test-secret-key-do-not-log"));
}

async function testParseCliArgs() {
  const args = parseCliArgs(["--dry-run", "--force", "--category=fed", "--limit=2", "--start=3"]);
  assert.strictEqual(args.dryRun, true);
  assert.strictEqual(args.force, true);
  assert.strictEqual(args.category, "fed");
  assert.strictEqual(args.limit, 2);
  assert.strictEqual(args.start, 3);
}

async function testGenerateSingleAssetUsesScenePromptOnly() {
  let capturedPrompt = null;
  const provider = {
    name: "mock-openai",
    async generateBackground(context) {
      capturedPrompt = context.scenePrompt;
      return {
        backgroundBuffer: await createSolidBackground(),
        provider: "mock-openai",
        prompt: context.scenePrompt,
      };
    },
  };

  const workItem = buildWorkQueue({ category: "fed", limit: 1 })[0];
  const result = await generateSingleAsset(workItem, { provider, sharp });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(capturedPrompt, workItem.prompt.scenePrompt);
}

async function run() {
  await testPromptMapHasExactly50Entries();
  await testEveryManifestAssetHasPromptDefinition();
  await testNoDuplicateTargetPaths();
  await testDryRunPerformsZeroProviderCalls();
  await testSafetyGateBlocksGeneration();
  await testExistingFileSkips();
  await testForceAllowsOverwrite();
  await testCategoryFilterWorks();
  await testLimitWorks();
  await testFailedGenerationContinuesNextAsset();
  await testResumeLogicWorks();
  await testOneItemProducesOneFile();
  await testNoCollageLogicExists();
  await testDeterministicOverlayStringsCorrect();
  await testOutputTargetIs1080Jpg();
  testNoForbiddenImports();
  await testNoApiKeyLogging();
  await testParseCliArgs();
  await testGenerateSingleAssetUsesScenePromptOnly();
  console.log("economic-fast-lane-artwork-generator.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("economic-fast-lane-artwork-generator.test.cjs: FAILED", error);
  process.exit(1);
});
