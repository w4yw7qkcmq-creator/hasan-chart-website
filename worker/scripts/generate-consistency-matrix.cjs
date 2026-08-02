#!/usr/bin/env node
/**
 * Editorial Consistency Photo Story Matrix — no OpenAI calls.
 *
 *   node worker/scripts/generate-consistency-matrix.cjs
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { buildEditorialPromptBundle } = require(path.join(root, "lib/news-images/editorial-intelligence"));

const MATRIX = [
  { key: "CPI-A", eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" },
  { key: "CPI-B", eventKey: "US_CPI_MOM", releaseTime: "2026-09-11T12:30:00.000Z" },
  { key: "NFP", eventKey: "US_NFP", releaseTime: "2026-09-05T12:30:00.000Z" },
  { key: "FED", eventKey: "US_FED_RATE_DECISION", releaseTime: "2026-09-17T18:00:00.000Z" },
  { key: "POWELL", eventKey: "US_POWELL_SPEECH", releaseTime: "2026-09-17T19:30:00.000Z" },
  { key: "ECB", eventKey: "ECB_RATE_DECISION", releaseTime: "2026-09-11T12:45:00.000Z" },
];

function main() {
  const rows = MATRIX.map((item) => {
    const bundle = buildEditorialPromptBundle({
      eventKey: item.eventKey,
      country: item.eventKey.startsWith("ECB") ? "EUROZONE" : "US",
      releaseTime: item.releaseTime,
    });
    return {
      key: item.key,
      eventKey: item.eventKey,
      releaseTime: item.releaseTime,
      promptSource: bundle.promptSource,
      sceneVariantId: bundle.photoStory?.sceneVariantId,
      cameraType: bundle.cameraPlan?.cameraType,
      lens: bundle.cameraPlan?.lens,
      compositionVariantId: bundle.photoStory?.compositionVariantId,
      consistencyKey: bundle.editorialConsistency?.consistencyKey,
      validationOk: bundle.validation.ok,
      photoStory: bundle.photoStory,
      cameraPlan: {
        cameraType: bundle.cameraPlan?.cameraType,
        lens: bundle.cameraPlan?.lens,
        cameraAngle: bundle.cameraPlan?.cameraAngle,
        compositionStyle: bundle.cameraPlan?.compositionStyle,
      },
    };
  });

  console.log("EDITORIAL_CONSISTENCY_MATRIX");
  console.log(JSON.stringify(rows, null, 2));

  const outDir = path.join(__dirname, ".tmp-consistency-matrix");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "consistency-matrix.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
}

main();
