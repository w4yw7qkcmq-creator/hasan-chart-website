#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");
const { buildEditorialPromptBundle, counts } = require(path.join(root, "lib/news-images/editorial-intelligence"));

const MATRIX = [
  { eventKey: "US_FED_RATE_DECISION", eventName: "Federal Reserve Interest Rate Decision", releaseTime: "2026-09-17T18:00:00.000Z" },
  { eventKey: "US_POWELL_SPEECH", eventName: "Federal Reserve Press Conference", releaseTime: "2026-09-18T18:30:00.000Z" },
  { eventKey: "US_CPI_MOM", eventName: "US CPI", releaseTime: "2026-08-12T12:30:00.000Z", previous: "0.2%", forecast: "0.3%", actual: "0.4%" },
  { eventKey: "US_NFP", eventName: "Non Farm Payrolls", releaseTime: "2026-09-05T12:30:00.000Z" },
  { eventKey: "US_INITIAL_JOBLESS_CLAIMS", eventName: "Initial Jobless Claims", releaseTime: "2026-08-07T12:30:00.000Z" },
  { eventKey: "US_GDP_QOQ", eventName: "US GDP", releaseTime: "2026-07-30T12:30:00.000Z" },
  { eventKey: "US_ISM_MANUFACTURING", eventName: "ISM Manufacturing", releaseTime: "2026-09-03T14:00:00.000Z" },
  { eventKey: "ECB_RATE_DECISION", eventName: "ECB Interest Rate Decision", releaseTime: "2026-09-11T12:15:00.000Z" },
  { eventKey: "ECB_LAGARDE_SPEECH", eventName: "ECB Press Conference", releaseTime: "2026-09-11T12:45:00.000Z" },
  { eventKey: "BOJ_RATE_DECISION", eventName: "Bank of Japan Rate Decision", releaseTime: "2026-09-19T03:00:00.000Z" },
];

function summarize(bundle) {
  return {
    eventKey: bundle.profile.canonicalEventKey,
    category: bundle.profile.eventCategory,
    person: bundle.entities.person?.id || null,
    institution: bundle.entities.institution?.id || null,
    country: bundle.entities.country?.id || null,
    markets: bundle.entities.markets.map((m) => m.id),
    primarySubjectType: bundle.visualSubjects.primarySubjectType,
    primaryVisualSubjects: bundle.visualSubjects.primary,
    secondaryVisualSubjects: bundle.visualSubjects.secondary,
    overlayPlacement: bundle.composition.overlayPlacement,
    displayTitle: bundle.displayTitle,
    validation: bundle.validation,
    prompt: bundle.prompt,
  };
}

const report = {
  counts,
  matrix: MATRIX.map((item) => summarize(buildEditorialPromptBundle({ ...item, country: item.country || undefined }))),
};

console.log("EDITORIAL_PROMPT_MATRIX", JSON.stringify(report, null, 2));
