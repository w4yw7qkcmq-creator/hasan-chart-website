#!/usr/bin/env node
/**
 * Prompt Matrix for Editorial Art Director — no OpenAI calls.
 *
 *   node worker/scripts/generate-art-director-prompt-matrix.cjs
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
  const prompts = MATRIX.map((item) => {
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
      artDirectionGroup: bundle.artDirection?.artDirectionGroup,
      heroSubject: bundle.artDirection?.heroSubject,
      supportingSubjects: bundle.artDirection?.supportingSubjects,
      validationOk: bundle.validation.ok,
      prompt: bundle.prompt,
    };
  });

  console.log("EDITORIAL_ART_DIRECTOR_PROMPT_MATRIX");
  for (const entry of prompts) {
    console.log("\n==================================================");
    console.log(`# ${entry.key} (${entry.eventKey})`);
    console.log(`group=${entry.artDirectionGroup} source=${entry.promptSource} valid=${entry.validationOk}`);
    console.log(`hero=${entry.heroSubject}`);
    console.log(`supporting=${(entry.supportingSubjects || []).join(" | ")}`);
    console.log("--------------------------------------------------");
    console.log(entry.prompt);
  }

  const outDir = path.join(__dirname, ".tmp-art-director-prompt-matrix");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "prompt-matrix.json"), JSON.stringify({ generatedAt: new Date().toISOString(), prompts }, null, 2));
}

main();
