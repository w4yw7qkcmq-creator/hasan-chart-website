#!/usr/bin/env node
/**
 * Editorial Identity Matrix — no OpenAI calls.
 *
 *   node worker/scripts/generate-editorial-identity-matrix.cjs
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { buildEditorialPromptBundle } = require(path.join(root, "lib/news-images/editorial-intelligence"));
const { validateEditorialIdentity } = require(path.join(root, "lib/news-images/editorial-identity-director"));
const { resolveSceneVariantGroup } = require(path.join(root, "lib/news-images/editorial-consistency-director/config/scene-variants"));

const MATRIX = [
  { key: "CPI", eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" },
  { key: "NFP", eventKey: "US_NFP", releaseTime: "2026-09-05T12:30:00.000Z" },
  { key: "FED", eventKey: "US_FED_RATE_DECISION", releaseTime: "2026-09-17T18:00:00.000Z" },
  { key: "POWELL", eventKey: "US_POWELL_SPEECH", releaseTime: "2026-09-17T19:30:00.000Z" },
  {
    key: "SELLOFF",
    eventKey: "WALL_STREET_SELLOFF",
    eventName: "Wall Street Sell-off",
    sourceText: "US stocks fall sharply in broad Wall Street sell-off",
    releaseTime: "2026-10-01T20:00:00.000Z",
  },
  {
    key: "GOLD",
    eventKey: "GOLD_RALLY",
    eventName: "Gold Rally",
    sourceText: "Gold prices rally as investors seek safe haven flows",
    releaseTime: "2026-10-02T12:00:00.000Z",
  },
  {
    key: "OIL",
    eventKey: "OIL_SUPPLY_DISRUPTION",
    eventName: "Oil Supply Disruption",
    sourceText: "Oil supply disruption raises energy market risk",
    releaseTime: "2026-10-03T08:00:00.000Z",
  },
  {
    key: "CRYPTO",
    eventKey: "BITCOIN_ETF_FLOWS",
    eventName: "Bitcoin ETF Flows",
    sourceText: "Institutional Bitcoin ETF flows surge",
    releaseTime: "2026-10-04T14:00:00.000Z",
  },
  {
    key: "HORMUZ",
    eventKey: "STRAIT_OF_HORMUZ_TENSION",
    eventName: "Strait of Hormuz Tension",
    sourceText: "Strait of Hormuz tension threatens oil shipping lanes",
    releaseTime: "2026-10-05T06:00:00.000Z",
  },
  {
    key: "EARNINGS",
    eventKey: "CORPORATE_EARNINGS_MAJOR",
    eventName: "Major Corporate Earnings",
    sourceText: "Major corporate earnings beat expectations",
    releaseTime: "2026-10-06T21:00:00.000Z",
  },
  {
    key: "POLITICAL_NO_ANGLE",
    eventKey: "GENERIC_POLITICAL_STATEMENT",
    eventName: "Political Campaign Speech",
    sourceText: "Domestic political campaign rally speech with no market linkage",
    releaseTime: "2026-10-07T18:00:00.000Z",
  },
];

function main() {
  const rows = MATRIX.map((item) => {
    const bundle = buildEditorialPromptBundle({
      eventKey: item.eventKey,
      eventName: item.eventName,
      sourceText: item.sourceText,
      country: item.country || "US",
      releaseTime: item.releaseTime,
    });
    const identity = bundle.editorialIdentity;
    const sceneGroup = bundle.artDirection
      ? resolveSceneVariantGroup(bundle.profile, bundle.artDirection)
      : null;

    return {
      key: item.key,
      eventKey: item.eventKey,
      skipped: Boolean(bundle.skipped),
      promptSource: bundle.promptSource,
      premiumImageEligible: identity?.premiumImageEligible ?? false,
      editorialDomain: identity?.editorialDomain || [],
      investorRelevance: identity?.investorRelevance || null,
      primaryMarket: identity?.primaryMarket || null,
      coverageMode: identity?.coverageMode || null,
      identityTone: identity?.identityTone || null,
      visualIntensity: identity?.visualIntensity || null,
      editorialSubtitle: identity?.editorialSubtitle ?? null,
      headlineLines: identity?.headlineLines || [],
      colorLanguage: identity?.colorLanguage || null,
      sceneGroup,
      selectedSceneVariant: bundle.photoStory?.sceneVariantId || null,
      cameraLanguage: bundle.cameraPlan?.cameraType || null,
      cameraLens: bundle.cameraPlan?.lens || null,
      compositionVariant: bundle.photoStory?.compositionVariantId || null,
      heroSubject: identity?.heroSubject || bundle.photoStory?.heroSubject || null,
      forbiddenSubjects: (identity?.forbiddenSubjects || []).slice(0, 6),
      marketAngle: identity?.marketAngle || null,
      identityValidationOk: identity ? validateEditorialIdentity(identity).ok : true,
      promptValidationOk: bundle.validation?.ok ?? true,
      usesDefaultSceneGroup: sceneGroup === "DEFAULT",
    };
  });

  console.log("EDITORIAL_IDENTITY_MATRIX");
  console.log(JSON.stringify(rows, null, 2));

  const outDir = path.join(__dirname, ".tmp-editorial-identity-matrix");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "identity-matrix.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)
  );
}

main();
