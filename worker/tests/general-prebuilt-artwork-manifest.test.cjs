#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-images");
const repoRoot = path.join(__dirname, "..", "..");

const {
  BRAND_IDENTITY,
  BRAND_IDENTITY_LABELS,
  CATEGORY_ARTWORK_COUNTS,
  getTotalArtworkCount,
  listManifestEntries,
} = require(path.join(root, "general-prebuilt-artwork-manifest"));
const {
  ARTWORK_PROMPT_DEFINITIONS,
  SCENE_DIRECTIVES,
  FORBIDDEN_DARK_SCENE_PHRASES,
  validatePromptDefinitionsAgainstManifest,
  validateSemanticScenePrompts,
  PETROLEUM_VISUAL_NOUN_PATTERN,
  listCatalogEntries,
} = require(path.join(root, "general-prebuilt-artwork-prompts"));
const {
  validateManifestStructure,
  validateArtworkFiles,
  validateGeneralPrebuiltArtwork,
} = require(path.join(root, "validate-general-prebuilt-artwork"));

function testManifestTotals() {
  assert.strictEqual(getTotalArtworkCount(), 50);
  assert.strictEqual(
    Object.values(CATEGORY_ARTWORK_COUNTS).reduce((sum, count) => sum + count, 0),
    50
  );
  assert.strictEqual(listManifestEntries().length, 50);
  assert.strictEqual(ARTWORK_PROMPT_DEFINITIONS.length, 50);
}

function testCategoryCounts() {
  assert.deepStrictEqual(CATEGORY_ARTWORK_COUNTS, {
    "iran-us": 6,
    "oil-up": 4,
    "oil-down": 4,
    gold: 5,
    usd: 4,
    "us-economy": 3,
    "fed-general": 3,
    geopolitics: 4,
    "hormuz-shipping": 3,
    "china-markets": 3,
    "global-markets-up": 3,
    "global-markets-down": 3,
    crypto: 3,
    "breaking-economic": 2,
  });
}

function testUniqueIdsAndPaths() {
  const ids = new Set();
  const paths = new Set();
  const publicPaths = new Set();
  for (const entry of listCatalogEntries()) {
    assert.ok(entry.id, `missing id for ${entry.relativePath}`);
    assert.ok(entry.displayTitle, `missing displayTitle for ${entry.relativePath}`);
    assert.ok(entry.subtitle, `missing subtitle for ${entry.relativePath}`);
    assert.ok(entry.scenePrompt, `missing scenePrompt for ${entry.relativePath}`);
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    assert.ok(!paths.has(entry.relativePath), `duplicate path ${entry.relativePath}`);
    assert.ok(!publicPaths.has(entry.publicPath), `duplicate publicPath ${entry.publicPath}`);
    ids.add(entry.id);
    paths.add(entry.relativePath);
    publicPaths.add(entry.publicPath);
    assert.match(entry.publicPath, /^\/news\/general-prebuilt\//);
    assert.doesNotMatch(entry.publicPath, /economic-fast-lane/);
  }
}

function testBrandIdentity() {
  assert.strictEqual(BRAND_IDENTITY, "ECONOMIC_NEWSI");
  assert.strictEqual(BRAND_IDENTITY_LABELS.en, "Economic Newsi");
}

function testPromptValidation() {
  const result = validatePromptDefinitionsAgainstManifest();
  assert.strictEqual(result.ok, true, JSON.stringify(result.issues));
}

function testSemanticOilPetroleumNouns() {
  const semantic = validateSemanticScenePrompts();
  assert.strictEqual(semantic.ok, true, JSON.stringify(semantic.issues));
  for (const definition of ARTWORK_PROMPT_DEFINITIONS) {
    if (definition.category !== "oil-up" && definition.category !== "oil-down") {
      continue;
    }
    assert.match(
      definition.scenePrompt,
      PETROLEUM_VISUAL_NOUN_PATTERN,
      `missing petroleum visual noun: ${definition.path}`
    );
  }
}

function testBrightGlobalSceneDirectives() {
  assert.match(SCENE_DIRECTIVES, /properly exposed|professionally exposed/i);
  assert.match(SCENE_DIRECTIVES, /natural color/i);
  assert.doesNotMatch(SCENE_DIRECTIVES, /dark navy and black visual treatment/i);
  assert.match(SCENE_DIRECTIVES, /avoid underexposure/i);
}

function testIranUsMilitaryPromptSafety() {
  const militaryPaths = ["iran-us/01.jpg", "iran-us/02.jpg", "iran-us/03.jpg", "iran-us/06.jpg"];
  for (const definition of ARTWORK_PROMPT_DEFINITIONS) {
    if (definition.category !== "iran-us") {
      continue;
    }
    assert.match(definition.scenePrompt, /generic editorial|not documentation of a specific/i);
    assert.match(definition.scenePrompt, /no gore|no casualties|non-graphic/i);
    if (militaryPaths.includes(definition.path)) {
      assert.match(definition.scenePrompt, /military jets?|military aircraft|naval|air-strike|distant smoke/i);
    }
  }
  const iran01 = ARTWORK_PROMPT_DEFINITIONS.find((d) => d.path === "iran-us/01.jpg");
  assert.strictEqual(iran01.subtitle, "MILITARY ESCALATION");
}

function testValidationAllowsEmptyPool() {
  const poolDir = path.join(os.tmpdir(), `general-prebuilt-empty-${Date.now()}`);
  fs.mkdirSync(poolDir, { recursive: true });
  try {
    const result = validateGeneralPrebuiltArtwork({ poolBaseDir: poolDir });
    assert.strictEqual(result.structure.ok, true);
    assert.strictEqual(result.brand.ok, true);
    assert.strictEqual(result.prompts.ok, true);
    assert.strictEqual(result.files.ok, true);
    assert.strictEqual(result.summary.totalExpected, 50);
    assert.strictEqual(result.summary.presentCount, 0);
    assert.strictEqual(result.summary.missingCount, 50);
  } finally {
    fs.rmSync(poolDir, { recursive: true, force: true });
  }
}

function testNoFastLaneCouplingInNewModules() {
  const modules = [
    "worker/lib/news-images/general-prebuilt-artwork-manifest.js",
    "worker/lib/news-images/general-prebuilt-artwork-prompts.js",
    "worker/lib/news-images/general-news-artwork-router.js",
    "worker/lib/news-images/general-prebuilt-artwork-generator.js",
  ];
  for (const relativePath of modules) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /require\([^)]*economic-image-pool/);
    assert.doesNotMatch(source, /require\([^)]*publisher-gateway/);
  }
  const routerSource = fs.readFileSync(
    path.join(repoRoot, "worker/lib/news-images/general-news-artwork-router.js"),
    "utf8"
  );
  assert.doesNotMatch(routerSource, /economic-fast-lane-artwork-manifest/);
}

function testManifestStructureValidation() {
  const structure = validateManifestStructure();
  assert.strictEqual(structure.ok, true);
  assert.strictEqual(structure.total, 50);
}

function run() {
  testManifestTotals();
  testCategoryCounts();
  testUniqueIdsAndPaths();
  testBrandIdentity();
  testPromptValidation();
  testSemanticOilPetroleumNouns();
  testBrightGlobalSceneDirectives();
  testIranUsMilitaryPromptSafety();
  testValidationAllowsEmptyPool();
  testNoFastLaneCouplingInNewModules();
  testManifestStructureValidation();
  console.log("general-prebuilt-artwork-manifest.test.cjs: all tests passed");
}

run();
