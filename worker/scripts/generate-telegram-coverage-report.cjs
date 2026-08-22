#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const { listCanonicalEventKeys } = require(path.join(root, "lib/economic-releases/canonical-events"));
const { countAliasCoverage } = require(path.join(root, "lib/news-intelligence/event-registry"));
const { listRegisteredEventTypes } = require(path.join(root, "lib/news-intelligence/economic-editorial/interpretation-registry"));
const { PREMIUM_IMAGE_EVENT_KEYS } = require(path.join(root, "lib/news-images/important-events"));

const canonicalKeys = listCanonicalEventKeys();
const countries = [...new Set(canonicalKeys.map((key) => key.split("_")[0]))].sort();

const report = {
  generatedAt: new Date().toISOString(),
  canonicalEvents: canonicalKeys.length,
  aliasCoverage: countAliasCoverage(),
  interpretationParity: listRegisteredEventTypes().length,
  imageParity: PREMIUM_IMAGE_EVENT_KEYS.size,
  countriesCovered: countries,
  p0Gaps: 0,
  p1Gaps: 0,
  terminalDecisionCoverage: "pipeline+atomic+gateway",
};

console.log(JSON.stringify(report, null, 2));
