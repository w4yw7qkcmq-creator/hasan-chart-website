import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  normalizePositiveBigIntString,
  normalizeSubscriptionRequestId,
  normalizeValidUuidOrBigInt,
  optionalValidUuid,
  requireValidPositiveBigIntString,
  requireValidSubscriptionRequestId,
  requireValidUuid,
  requireValidUuidOrBigInt,
} from "../lib/id-validation.js";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const LARGE_BIGINT = "9007199254740993";

function testValidUuidAccepted() {
  assert.equal(requireValidUuid(VALID_UUID), VALID_UUID);
  assert.equal(requireValidUuid(` ${VALID_UUID} `), VALID_UUID);
}

function testInvalidUuidRejected() {
  assert.throws(() => requireValidUuid("not-a-uuid"), (error) => {
    assert.equal(error.code, "INVALID_UUID");
    assert.equal(error.fieldName, "id");
    assert.equal(error.status, 400);
    return true;
  });
}

function testValidBigintAccepted() {
  assert.equal(requireValidPositiveBigIntString("1234567890"), "1234567890");
  assert.equal(requireValidUuidOrBigInt("42"), "42");
  assert.equal(requireValidSubscriptionRequestId("42"), "42");
}

function testLargeBigintStaysString() {
  assert.equal(requireValidSubscriptionRequestId(LARGE_BIGINT), LARGE_BIGINT);
  assert.notEqual(Number(LARGE_BIGINT).toString(), LARGE_BIGINT);
}

function testZeroRejectedForSubscriptionIds() {
  assert.equal(normalizeSubscriptionRequestId("0"), null);
  assert.throws(() => requireValidSubscriptionRequestId("0"), /INVALID_REQUESTID/);
  assert.throws(
    () => requireValidPositiveBigIntString("0"),
    (error) => error.code === "INVALID_POSITIVE_BIGINT_ID"
  );
}

function testNegativeRejected() {
  for (const value of ["-1", "-123"]) {
    assert.equal(normalizeValidUuidOrBigInt(value), null);
    assert.throws(() => requireValidSubscriptionRequestId(value), /INVALID_REQUESTID/);
  }
}

function testDecimalRejected() {
  assert.equal(normalizeSubscriptionRequestId("12.34"), null);
}

function testMixedAlphanumericRejected() {
  for (const value of ["123abc", "abc123", "123 456"]) {
    assert.equal(normalizeSubscriptionRequestId(value), null);
  }
}

function testPathTraversalRejected() {
  for (const value of ["../123", "123/456", "123;drop"]) {
    assert.equal(normalizeSubscriptionRequestId(value), null);
  }
}

function testNullUndefinedEmptyRejected() {
  for (const value of [undefined, null, "", "   "]) {
    assert.equal(normalizeSubscriptionRequestId(value), null);
    assert.throws(() => requireValidSubscriptionRequestId(value), /INVALID_REQUESTID/);
  }
}

function testOptionalUuidAllowsEmpty() {
  assert.equal(optionalValidUuid(""), null);
  assert.equal(optionalValidUuid(null), null);
  assert.equal(optionalValidUuid(undefined), null);
  assert.equal(optionalValidUuid(VALID_UUID), VALID_UUID);
}

function testUuidOrBigIntAcceptsBothOnly() {
  assert.equal(requireValidUuidOrBigInt(VALID_UUID), VALID_UUID);
  assert.equal(requireValidUuidOrBigInt("99"), "99");
  assert.throws(() => requireValidUuidOrBigInt("bad"), (error) => {
    assert.equal(error.code, "INVALID_UUID_OR_BIGINT_ID");
    return true;
  });
}

function testCentralModuleHasNoNumberConversion() {
  const source = readFileSync(new URL("../lib/id-validation.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Number\(/);
  assert.doesNotMatch(source, /parseInt\(/);
  assert.doesNotMatch(source, /parseFloat\(/);
}

function testNormalizePositiveBigIntStringRules() {
  assert.equal(normalizePositiveBigIntString("0042"), null);
  assert.equal(normalizePositiveBigIntString("42"), "42");
}

const tests = [
  ["valid uuid accepted", testValidUuidAccepted],
  ["invalid uuid rejected", testInvalidUuidRejected],
  ["valid bigint accepted", testValidBigintAccepted],
  ["large bigint stays string", testLargeBigintStaysString],
  ["zero rejected for subscription ids", testZeroRejectedForSubscriptionIds],
  ["negative rejected", testNegativeRejected],
  ["decimal rejected", testDecimalRejected],
  ["mixed alphanumeric rejected", testMixedAlphanumericRejected],
  ["path traversal rejected", testPathTraversalRejected],
  ["null undefined empty rejected", testNullUndefinedEmptyRejected],
  ["optional uuid allows empty", testOptionalUuidAllowsEmpty],
  ["uuid or bigint accepts both only", testUuidOrBigIntAcceptsBothOnly],
  ["central module has no number conversion", testCentralModuleHasNoNumberConversion],
  ["positive bigint rejects leading zeros", testNormalizePositiveBigIntStringRules],
];

let passed = 0;

for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} id validation checks passed`);
