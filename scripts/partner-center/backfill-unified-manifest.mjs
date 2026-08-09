#!/usr/bin/env node
/**
 * Unified backfill manifest loader + SHA-256 hash for execution approval gate.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function hashManifest(manifest) {
  const { manifestSha256, manifestSha256Expected, ...rest } = manifest;
  const body = stableStringify(rest);
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function loadManifest(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const manifest = JSON.parse(raw);
  manifest.manifestSha256 = hashManifest(manifest);
  return manifest;
}

export function assertManifestHash(manifest, expectedHash) {
  const actual = hashManifest(manifest);
  if (actual !== expectedHash) {
    throw new Error(`MANIFEST_HASH_MISMATCH expected=${expectedHash} actual=${actual}`);
  }
  return true;
}

export function validateManifestStructure(manifest) {
  const required = [
    "approvedCommissionIds",
    "approvedWithdrawalDebitIds",
    "openingAdjustments",
    "specialCaseAdjustments",
    "testSettlementAdjustments",
    "expectedEntryCounts",
  ];
  for (const key of required) {
    if (!(key in manifest)) throw new Error(`MANIFEST_MISSING_${key}`);
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] || "scripts/partner-center/.artifacts/step3b-unified-backfill-manifest.json";
  const manifest = loadManifest(file);
  validateManifestStructure(manifest);
  console.log(JSON.stringify({ file, manifestSha256: manifest.manifestSha256, expectedEntryCounts: manifest.expectedEntryCounts }, null, 2));
}
