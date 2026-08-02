#!/usr/bin/env node
/**
 * Photo Story Matrix — no OpenAI calls.
 *
 *   node worker/scripts/generate-photo-story-matrix.cjs
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { buildEditorialPromptBundle } = require(path.join(root, "lib/news-images/editorial-intelligence"));

const MATRIX = [
  { key: "CPI", eventKey: "US_CPI_MOM", eventName: "US CPI Inflation", releaseTime: "2026-08-12T12:30:00.000Z" },
  { key: "NFP", eventKey: "US_NFP", eventName: "Non Farm Payrolls", releaseTime: "2026-09-05T12:30:00.000Z" },
  { key: "FED", eventKey: "US_FED_RATE_DECISION", eventName: "Federal Reserve Interest Rate Decision", releaseTime: "2026-09-17T18:00:00.000Z" },
  { key: "POWELL", eventKey: "US_POWELL_SPEECH", eventName: "Federal Reserve Press Conference", releaseTime: "2026-09-17T19:30:00.000Z" },
  { key: "ECB", eventKey: "ECB_RATE_DECISION", eventName: "ECB Interest Rate Decision", releaseTime: "2026-09-11T12:45:00.000Z" },
];

function main() {
  const stories = MATRIX.map((item) => {
    const bundle = buildEditorialPromptBundle({
      eventKey: item.eventKey,
      eventName: item.eventName,
      country: item.eventKey.startsWith("ECB") ? "EUROZONE" : "US",
      releaseTime: item.releaseTime,
    });

    return {
      key: item.key,
      eventKey: item.eventKey,
      promptSource: bundle.promptSource,
      validationOk: bundle.validation.ok,
      photoStory: bundle.photoStory,
      cameraPlan: bundle.cameraPlan,
      prompt: bundle.prompt,
    };
  });

  console.log("PHOTOJOURNALISM_DIRECTOR_PHOTO_STORY_MATRIX");
  for (const entry of stories) {
    console.log("\n==================================================");
    console.log(`# ${entry.key} (${entry.eventKey}) valid=${entry.validationOk} source=${entry.promptSource}`);
    console.log("--- Photo Story ---");
    console.log(JSON.stringify(entry.photoStory, null, 2));
    console.log("--- Camera Plan ---");
    console.log(JSON.stringify(entry.cameraPlan, null, 2));
    console.log("--- Prompt ---");
    console.log(entry.prompt);
  }

  const outDir = path.join(__dirname, ".tmp-photo-story-matrix");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "photo-story-matrix.json"), JSON.stringify({ generatedAt: new Date().toISOString(), stories }, null, 2));
}

main();
