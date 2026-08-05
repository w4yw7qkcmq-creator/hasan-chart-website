#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { evaluatePriceAlertCondition, validateTargetPriceAtCreation } = require("../worker/lib/price-alert-condition.js");

assert.equal(
  evaluatePriceAlertCondition({ condition: "above", targetPrice: 100, currentPrice: 100 }).triggered,
  true
);
assert.equal(
  evaluatePriceAlertCondition({ condition: "below", targetPrice: 100, currentPrice: 100 }).triggered,
  true
);
assert.equal(
  evaluatePriceAlertCondition({ condition: "above", targetPrice: 100, currentPrice: 99.9999 }).triggered,
  false
);
assert.equal(
  evaluatePriceAlertCondition({ condition: "below", targetPrice: 0.0001, currentPrice: 0.00009 }).triggered,
  true
);
assert.equal(
  evaluatePriceAlertCondition({ condition: "above", targetPrice: 65000, currentPrice: 70000 }).triggered,
  true
);
assert.equal(validateTargetPriceAtCreation("NaN").ok, false);
assert.equal(validateTargetPriceAtCreation(-1).ok, false);
assert.equal(validateTargetPriceAtCreation(0).ok, false);

console.log("price alert condition PASS");
