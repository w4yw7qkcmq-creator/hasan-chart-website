#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const {
  evaluateBackgroundExposure,
  inspectBackgroundExposure,
} = require(path.join(__dirname, "..", "lib", "news-images", "general-prebuilt-background-exposure-guard"));

function testRejectedPrototypeMetricsFailGate() {
  const rejectedIran = {
    meanLuminance: 14.98,
    medianLuminance: 10.32,
    p10Luminance: 3.37,
    nearBlack25Pct: 90.28,
  };
  const rejectedOil = {
    meanLuminance: 18.47,
    medianLuminance: 5.5,
    p10Luminance: 0,
    nearBlack25Pct: 66.55,
  };
  assert.strictEqual(evaluateBackgroundExposure(rejectedIran).accepted, false);
  assert.strictEqual(evaluateBackgroundExposure(rejectedOil).accepted, false);
}

function testApprovedFastLaneCpiMetricsPassGate() {
  const approvedCpi = {
    meanLuminance: 100.06,
    medianLuminance: 107.14,
    p10Luminance: 7.67,
    nearBlack25Pct: 15.99,
  };
  assert.strictEqual(evaluateBackgroundExposure(approvedCpi).accepted, true);
}

async function testInspectCurrentPrototypeIfPresent() {
  const fs = require("fs");
  const sharp = require("sharp");
  const file = path.join(__dirname, "..", "..", "public/news/general-prebuilt/oil-up/01.jpg");
  if (!fs.existsSync(file)) {
    return;
  }
  const buffer = fs.readFileSync(file);
  const inspection = await inspectBackgroundExposure(buffer, { sharp });
  assert.ok(inspection.metrics);
}

function run() {
  testRejectedPrototypeMetricsFailGate();
  testApprovedFastLaneCpiMetricsPassGate();
  return Promise.resolve(testInspectCurrentPrototypeIfPresent()).then(() => {
    console.log("general-prebuilt-exposure-guard.test.cjs: all tests passed");
  });
}

run().catch((error) => {
  console.error("general-prebuilt-exposure-guard.test.cjs: FAILED", error);
  process.exit(1);
});
